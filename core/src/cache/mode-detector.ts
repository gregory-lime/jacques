/**
 * Mode Detector
 *
 * Detect session mode (planning vs execution) and extract plan references
 * from parsed JSONL entries.
 */

import type { ParsedEntry } from "../session/parser.js";
import { PLAN_TRIGGER_PATTERNS, extractPlanTitle } from "../archive/plan-extractor.js";
import type { PlanRef } from "./types.js";

/**
 * Represents a completed plan mode cycle (EnterPlanMode -> ExitPlanMode).
 * Used by notification service to fire exactly one notification per plan completion.
 */
export interface PlanModeCompletion {
  /** Index of the ExitPlanMode entry in the entries array */
  exitIndex: number;
  /** Best title found from planRefs within this plan mode interval */
  title: string;
}

/**
 * Detect session mode (planning vs execution) and extract plan references.
 *
 * - Planning mode: EnterPlanMode tool was called during session
 * - Execution mode: First user message contains plan trigger pattern
 */
export function detectModeAndPlans(entries: ParsedEntry[]): {
  mode: 'planning' | 'execution' | null;
  planRefs: PlanRef[];
  planModeCompletions: PlanModeCompletion[];
} {
  let mode: 'planning' | 'execution' | null = null;
  const planRefs: PlanRef[] = [];

  // Track if currently in plan mode (enter/exit pairs)
  let inPlanMode = false;
  // Track plan mode intervals for notification grouping
  let currentEnterIndex = -1;
  const planModeIntervals: Array<{ enterIndex: number; exitIndex: number }> = [];
  // Track first real user message for execution mode detection
  let firstUserMessageChecked = false;

  entries.forEach((entry, index) => {
    // Check for EnterPlanMode / ExitPlanMode tool calls
    if (entry.type === 'tool_call' && entry.content.toolName === 'EnterPlanMode') {
      inPlanMode = true;
      currentEnterIndex = index;
    }
    if (entry.type === 'tool_call' && entry.content.toolName === 'ExitPlanMode') {
      inPlanMode = false;
      if (currentEnterIndex >= 0) {
        planModeIntervals.push({ enterIndex: currentEnterIndex, exitIndex: index });
        currentEnterIndex = -1;
      }
    }

    // Check first user message for execution mode
    if (entry.type === 'user_message' && entry.content.text && !firstUserMessageChecked) {
      const text = entry.content.text.trim();

      // Skip internal command messages
      if (
        text.startsWith('<local-command') ||
        text.startsWith('<command-') ||
        text.length === 0
      ) {
        return;
      }

      firstUserMessageChecked = true;

      // Check if first message matches plan trigger patterns
      for (const pattern of PLAN_TRIGGER_PATTERNS) {
        if (pattern.test(text)) {
          mode = 'execution';

          // Extract plan content and title
          const match = text.match(pattern);
          if (match) {
            const planContent = text.substring(match[0].length).trim();
            // Only count as plan if it has content with markdown heading
            if (planContent.length >= 100 && planContent.includes('#')) {
              const title = extractPlanTitle(planContent);
              planRefs.push({
                title,
                source: 'embedded',
                messageIndex: index,
              });
            }
          }
          break;
        }
      }
    }

    // Check for embedded plans in other user messages (not just first)
    if (entry.type === 'user_message' && entry.content.text && firstUserMessageChecked) {
      const text = entry.content.text.trim();

      // Skip internal command messages
      if (
        text.startsWith('<local-command') ||
        text.startsWith('<command-') ||
        text.length === 0
      ) {
        return;
      }

      // Check for plan trigger patterns in subsequent messages
      for (const pattern of PLAN_TRIGGER_PATTERNS) {
        if (pattern.test(text)) {
          const match = text.match(pattern);
          if (match) {
            const planContent = text.substring(match[0].length).trim();
            if (planContent.length >= 100 && planContent.includes('#')) {
              const title = extractPlanTitle(planContent);
              // Avoid duplicate entries for the same message
              if (!planRefs.some(r => r.messageIndex === index)) {
                planRefs.push({
                  title,
                  source: 'embedded',
                  messageIndex: index,
                });
              }
            }
          }
          break;
        }
      }
    }

    // Check for Plan agent responses from agent_progress entries
    if (entry.type === 'agent_progress' && entry.content.agentType === 'Plan') {
      const agentId = entry.content.agentId;
      if (agentId && !planRefs.some(r => r.source === 'agent' && r.agentId === agentId)) {
        planRefs.push({
          title: entry.content.agentDescription || 'Agent-Generated Plan',
          source: 'agent',
          messageIndex: index,
          agentId,
        });
      }
    }

    // Check for Write tool calls to plan files
    if (entry.type === 'tool_call' && entry.content.toolName === 'Write') {
      const input = entry.content.toolInput as { file_path?: string; content?: string } | undefined;
      const filePath = input?.file_path || '';
      const content = input?.content || '';

      // Skip code files - they're not plans even if "plan" is in the name
      const codeExtensions = [
        '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
        '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
        '.c', '.cpp', '.h', '.hpp', '.cs', '.php',
        '.vue', '.svelte', '.astro',
        '.css', '.scss', '.less', '.sass',
        '.html', '.htm', '.xml', '.svg',
        '.json', '.yaml', '.yml', '.toml',
        '.sh', '.bash', '.zsh', '.fish',
        '.sql', '.graphql', '.prisma',
      ];
      const isCodeFile = codeExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
      if (isCodeFile) {
        return;
      }

      // Check if path looks like a plan file
      const pathLooksLikePlan =
        filePath.toLowerCase().includes('plan') ||
        filePath.endsWith('.plan.md') ||
        filePath.includes('.jacques/plans/');

      // Check if content looks like markdown plan (not code)
      const hasHeading = /^#+\s+.+/m.test(content);
      const hasListOrParagraph = /^[-*]\s+.+/m.test(content) || content.split('\n\n').length > 1;
      const firstLine = content.split('\n').find(line => line.trim().length > 0) || '';
      const codePatterns = [
        /^import\s+/,
        /^export\s+/,
        /^const\s+/,
        /^function\s+/,
        /^class\s+/,
        /^interface\s+/,
        /^type\s+/,
      ];
      const looksLikeCode = codePatterns.some(p => p.test(firstLine.trim()));
      const looksLikeMarkdown = hasHeading && hasListOrParagraph && !looksLikeCode;

      if (pathLooksLikePlan && looksLikeMarkdown) {
        const title = extractPlanTitle(content);
        planRefs.push({
          title,
          source: 'write',
          messageIndex: index,
          filePath,
        });
      }
    }
  });

  // Planning mode takes precedence if currently in plan mode
  if (inPlanMode) {
    mode = 'planning';
  }

  // Build planModeCompletions from completed intervals
  const planModeCompletions: PlanModeCompletion[] = planModeIntervals.map(interval => {
    // Find planRefs within this interval
    const refsInInterval = planRefs.filter(
      ref => ref.messageIndex >= interval.enterIndex && ref.messageIndex <= interval.exitIndex
    );

    // Pick best title: write > agent (non-default) > first ref > fallback
    let title = 'Plan Ready';
    const writeRef = refsInInterval.find(r => r.source === 'write');
    const agentRef = refsInInterval.find(r => r.source === 'agent');
    if (writeRef?.title) {
      title = writeRef.title;
    } else if (agentRef?.title && agentRef.title !== 'Agent-Generated Plan') {
      title = agentRef.title;
    } else if (refsInInterval.length > 0 && refsInInterval[0].title) {
      title = refsInInterval[0].title;
    }

    return { exitIndex: interval.exitIndex, title };
  });

  return { mode, planRefs, planModeCompletions };
}
