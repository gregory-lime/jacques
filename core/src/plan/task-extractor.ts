/**
 * Task Extractor
 *
 * Extracts task signals from parsed JSONL entries.
 * Handles:
 * - TaskCreate, TaskUpdate, TaskList tool calls
 * - TodoWrite tool calls (legacy)
 * - agent_progress entries (subagent work)
 * - bash_progress entries (command execution)
 * - File heuristics (fallback)
 */

import type { ParsedEntry } from "../session/parser.js";
import type { TaskSignal } from "./types.js";

/**
 * Task state tracked from TaskCreate/TaskUpdate calls
 */
interface TaskState {
  id: string;
  subject: string;
  description?: string;
  status: "pending" | "in_progress" | "completed";
  timestamp: string;
}

/**
 * Extract task signals from parsed JSONL entries.
 *
 * Handles multiple signal sources:
 * 1. TaskCreate/TaskUpdate (current) - Build task state map, emit final states
 * 2. TaskList (current) - Parse task list snapshots for state
 * 3. TodoWrite (legacy) - Extract todos[] array
 * 4. agent_progress - Subagent completion signals
 * 5. bash_progress - Command execution with test/build keywords
 * 6. File heuristic (fallback) - Write/Edit file paths as completed signals
 */
export function extractTaskSignals(
  entries: ParsedEntry[],
  sessionId: string
): TaskSignal[] {
  const signals: TaskSignal[] = [];

  // Track TaskCreate/TaskUpdate state
  const taskStates = new Map<string, TaskState>();
  let hasTaskToolCalls = false;

  for (const entry of entries) {
    // Handle agent_progress entries
    if (entry.type === "agent_progress") {
      const agentSignal = extractAgentProgressSignal(entry, sessionId);
      if (agentSignal) {
        signals.push(agentSignal);
      }
      continue;
    }

    // Handle bash_progress entries (test runs, builds)
    if (entry.type === "bash_progress") {
      const bashSignal = extractBashProgressSignal(entry, sessionId);
      if (bashSignal) {
        signals.push(bashSignal);
      }
      continue;
    }

    // Only process tool_call entries from here
    if (entry.type !== "tool_call") {
      continue;
    }

    const toolName = entry.content.toolName;
    const toolInput = entry.content.toolInput as Record<string, unknown> | undefined;

    if (!toolName) {
      continue;
    }

    // Handle TaskCreate
    if (toolName === "TaskCreate" && toolInput) {
      hasTaskToolCalls = true;
      const taskId = extractTaskIdFromResponse(entry, entries);
      const subject = (toolInput.subject as string) || "";
      const description = toolInput.description as string | undefined;

      if (taskId && subject) {
        taskStates.set(taskId, {
          id: taskId,
          subject,
          description,
          status: "pending",
          timestamp: entry.timestamp,
        });
      }
    }

    // Handle TaskUpdate
    if (toolName === "TaskUpdate" && toolInput) {
      hasTaskToolCalls = true;
      const taskId = toolInput.taskId as string | undefined;
      const status = toolInput.status as string | undefined;
      const subject = toolInput.subject as string | undefined;

      if (taskId) {
        const existing = taskStates.get(taskId);
        const newStatus = mapTaskStatus(status);

        if (existing) {
          taskStates.set(taskId, {
            ...existing,
            subject: subject || existing.subject,
            status: newStatus && newStatus !== "unknown" ? newStatus : existing.status,
            timestamp: entry.timestamp,
          });
        } else {
          // TaskUpdate without prior TaskCreate (possible if task was created in another session)
          taskStates.set(taskId, {
            id: taskId,
            subject: subject || `Task ${taskId}`,
            status: newStatus && newStatus !== "unknown" ? newStatus : "pending",
            timestamp: entry.timestamp,
          });
        }
      }
    }

    // Handle TaskList - parse result for task state snapshot
    if (toolName === "TaskList") {
      hasTaskToolCalls = true;
      const taskListSignals = extractTaskListSignals(entry, entries, sessionId);
      signals.push(...taskListSignals);
    }

    // Handle TodoWrite (legacy)
    if (toolName === "TodoWrite" && toolInput) {
      hasTaskToolCalls = true;
      const todos = toolInput.todos as Array<{
        id?: string;
        content?: string;
        status?: string;
      }> | undefined;

      if (todos && Array.isArray(todos)) {
        for (const todo of todos) {
          const content = todo.content || "";
          const status = mapTaskStatus(todo.status);

          if (content) {
            signals.push({
              source: "todo_write",
              text: content,
              status: status || "pending",
              timestamp: entry.timestamp,
              taskId: todo.id,
              sessionId,
            });
          }
        }
      }
    }
  }

  // Convert TaskCreate/TaskUpdate states to signals
  for (const state of taskStates.values()) {
    signals.push({
      source: state.status === "pending" ? "task_create" : "task_update",
      text: state.subject,
      status: state.status,
      timestamp: state.timestamp,
      taskId: state.id,
      sessionId,
    });
  }

  // File heuristics: Only if no task tool calls were found
  if (!hasTaskToolCalls) {
    const fileSignals = extractFileHeuristics(entries, sessionId);
    signals.push(...fileSignals);
  }

  return signals;
}

/**
 * Map status strings to our status type.
 */
function mapTaskStatus(
  status: string | undefined
): TaskSignal["status"] | undefined {
  if (!status) return undefined;

  const normalized = status.toLowerCase();
  if (normalized === "completed" || normalized === "done") {
    return "completed";
  }
  if (normalized === "in_progress" || normalized === "in-progress") {
    return "in_progress";
  }
  if (normalized === "pending" || normalized === "todo") {
    return "pending";
  }
  return "unknown";
}

/**
 * Extract signals from TaskList tool result.
 * TaskList returns a snapshot of all task states in format:
 * "#1 [completed] Subject text"
 * "#2 [in_progress] Another task"
 */
function extractTaskListSignals(
  taskListEntry: ParsedEntry,
  allEntries: ParsedEntry[],
  sessionId: string
): TaskSignal[] {
  const signals: TaskSignal[] = [];

  // Find the tool result following this TaskList call
  const resultContent = findToolResultContent(taskListEntry, allEntries);
  if (!resultContent) {
    return signals;
  }

  // Parse TaskList output: "#N [status] Subject"
  const taskPattern = /#(\d+)\s+\[(\w+)\]\s+(.+)/g;
  let match: RegExpExecArray | null;

  while ((match = taskPattern.exec(resultContent)) !== null) {
    const taskId = match[1];
    const statusStr = match[2];
    const subject = match[3].trim();
    const status = mapTaskStatus(statusStr) || "unknown";

    signals.push({
      source: "task_list",
      text: subject,
      status,
      timestamp: taskListEntry.timestamp,
      taskId,
      sessionId,
    });
  }

  return signals;
}

/**
 * Find the tool result content following a tool call.
 * Looks in subsequent user_message entries for the result.
 */
function findToolResultContent(
  toolCallEntry: ParsedEntry,
  allEntries: ParsedEntry[]
): string | undefined {
  const callIndex = allEntries.indexOf(toolCallEntry);
  if (callIndex === -1) return undefined;

  const toolUseId = toolCallEntry.content.toolUseId;

  // Look for the result in subsequent entries (within a reasonable window)
  for (let i = callIndex + 1; i < Math.min(callIndex + 10, allEntries.length); i++) {
    const entry = allEntries[i];

    // user_message entries can contain tool results
    if (entry.type === "user_message") {
      // Check for structured toolUseResult
      const toolUseResult = entry.content.toolUseResult as Record<string, unknown> | undefined;
      if (toolUseResult) {
        // Try to get text from the result
        if (typeof toolUseResult.content === "string") {
          return toolUseResult.content;
        }
        if (typeof toolUseResult.text === "string") {
          return toolUseResult.text;
        }
      }

      // Check for text content that might be the result
      const text = entry.content.text;
      if (text && toolUseId) {
        // If text contains task list format, return it
        if (/#\d+\s+\[\w+\]/.test(text)) {
          return text;
        }
      }
    }

    // tool_result entries directly contain the result
    if (entry.type === "tool_result") {
      const content = entry.content.toolResultContent;
      if (content && typeof content === "string") {
        return content;
      }
    }
  }

  return undefined;
}

/**
 * Extract signal from agent_progress entry (subagent work).
 * Only generates signal for completed agent work.
 */
function extractAgentProgressSignal(
  entry: ParsedEntry,
  sessionId: string
): TaskSignal | null {
  const content = entry.content;

  // Only count completed agent messages (assistant type indicates agent responded)
  if (content.agentMessageType !== "assistant") {
    return null;
  }

  // Use agent description or first ~100 chars of prompt as signal text
  let text = content.agentDescription || "";
  if (!text && content.agentPrompt) {
    text = content.agentPrompt.slice(0, 100);
    if (content.agentPrompt.length > 100) {
      text += "...";
    }
  }

  if (!text) {
    return null;
  }

  // Include agent type in text for better matching
  if (content.agentType && content.agentType !== "unknown") {
    text = `[${content.agentType}] ${text}`;
  }

  return {
    source: "agent_progress",
    text,
    status: "completed",
    timestamp: entry.timestamp,
    sessionId,
  };
}

/**
 * Extract signal from bash_progress entry.
 * Only generates signals for completed commands with relevant keywords.
 */
function extractBashProgressSignal(
  entry: ParsedEntry,
  sessionId: string
): TaskSignal | null {
  const content = entry.content;

  // Need full output to analyze
  const output = content.bashFullOutput || content.bashOutput || "";
  if (!output) {
    return null;
  }

  // Look for test/build related keywords in output
  const testKeywords = ["test", "spec", "passed", "failed", "PASS", "FAIL", "error", "success"];
  const buildKeywords = ["build", "compile", "bundle", "webpack", "vite", "tsc"];
  const deployKeywords = ["deploy", "publish", "release"];

  const outputLower = output.toLowerCase();
  let signalType: string | null = null;
  let status: TaskSignal["status"] = "completed";

  // Check for test runs
  if (testKeywords.some(kw => outputLower.includes(kw.toLowerCase()))) {
    signalType = "test";
    // Check for failures
    if (/fail|error/i.test(output) && !/0 fail|0 error/i.test(output)) {
      status = "in_progress"; // Tests failed, work not complete
    }
  }
  // Check for builds
  else if (buildKeywords.some(kw => outputLower.includes(kw.toLowerCase()))) {
    signalType = "build";
    if (/error|fail/i.test(output) && !/0 error|0 fail/i.test(output)) {
      status = "in_progress";
    }
  }
  // Check for deployments
  else if (deployKeywords.some(kw => outputLower.includes(kw.toLowerCase()))) {
    signalType = "deploy";
  }

  if (!signalType) {
    return null;
  }

  // Create a descriptive text
  const elapsed = content.bashElapsedSeconds;
  const elapsedStr = elapsed ? ` (${elapsed.toFixed(1)}s)` : "";
  const text = `Ran ${signalType}${elapsedStr}`;

  return {
    source: "bash_progress",
    text,
    status,
    timestamp: entry.timestamp,
    sessionId,
  };
}

/**
 * Try to extract task ID from the tool result following a TaskCreate call.
 * Prioritizes structured toolUseResult data over text parsing.
 */
function extractTaskIdFromResponse(
  createEntry: ParsedEntry,
  allEntries: ParsedEntry[]
): string | undefined {
  const createIndex = allEntries.indexOf(createEntry);
  if (createIndex === -1) return undefined;

  const toolUseId = createEntry.content.toolUseId;

  // Look for the next user entry which should contain the tool result
  for (let i = createIndex + 1; i < Math.min(createIndex + 5, allEntries.length); i++) {
    const entry = allEntries[i];
    if (entry.type === "user_message") {
      // Priority 1: Check for toolUseResult.task.id (structured data - most reliable)
      const toolResult = entry.content.toolUseResult as
        | { task?: { id?: string }; taskId?: string }
        | undefined;

      if (toolResult?.task?.id) {
        return toolResult.task.id;
      }

      // Priority 2: Check for toolUseResult.taskId directly
      if (toolResult?.taskId) {
        return toolResult.taskId;
      }

      // Priority 3: Check for nested result structure
      if (toolResult && typeof toolResult === "object") {
        // Sometimes the result has a different structure
        const result = toolResult as Record<string, unknown>;
        if (result.id && typeof result.id === "string") {
          return result.id;
        }
      }

      // Priority 4: Fallback to text parsing
      const text = entry.content.text;
      if (text) {
        // Match various patterns: "Task #1 created", "Created task 1", etc.
        const patterns = [
          /Task #(\d+)/i,
          /task\s+(\d+)/i,
          /created.*#(\d+)/i,
          /id[:\s]+(\d+)/i,
        ];

        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            return match[1];
          }
        }
      }
    }
  }

  // Fallback: use a generated ID based on position
  return `auto-${createIndex}`;
}

/**
 * Extract file modification signals from Write/Edit tool calls.
 * Used as a fallback when no task tools are present.
 */
function extractFileHeuristics(
  entries: ParsedEntry[],
  sessionId: string
): TaskSignal[] {
  const signals: TaskSignal[] = [];
  const seenFiles = new Set<string>();

  for (const entry of entries) {
    if (entry.type !== "tool_call") {
      continue;
    }

    const toolName = entry.content.toolName;
    const toolInput = entry.content.toolInput as Record<string, unknown> | undefined;

    if (!toolInput) {
      continue;
    }

    let filePath: string | undefined;

    if (toolName === "Write") {
      filePath = toolInput.file_path as string | undefined;
    } else if (toolName === "Edit") {
      filePath = toolInput.file_path as string | undefined;
    }

    if (filePath && !seenFiles.has(filePath)) {
      seenFiles.add(filePath);

      // Extract filename for the signal text
      const filename = filePath.split(/[/\\]/).pop() || filePath;

      signals.push({
        source: "file_heuristic",
        text: `Modified ${filename}`,
        status: "completed",
        timestamp: entry.timestamp,
        filePath,
        sessionId,
      });
    }
  }

  return signals;
}

/**
 * Get all unique file paths modified in the session.
 */
export function getModifiedFiles(entries: ParsedEntry[]): string[] {
  const files = new Set<string>();

  for (const entry of entries) {
    if (entry.type !== "tool_call") continue;

    const toolName = entry.content.toolName;
    const toolInput = entry.content.toolInput as Record<string, unknown> | undefined;

    if (!toolInput) continue;

    if (toolName === "Write" || toolName === "Edit") {
      const filePath = toolInput.file_path as string | undefined;
      if (filePath) {
        files.add(filePath);
      }
    }
  }

  return Array.from(files);
}
