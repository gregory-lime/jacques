/**
 * Compact Prompt Template
 *
 * The prompt to give to Claude to create a handoff document
 * before context is automatically compacted.
 */

export const COMPACT_PROMPT = `Please create a comprehensive handoff document for continuing this work in a new session. 
Save it to \`.jacques-handoff.md\` in the project root.

Structure it as follows:

## Current Task
[What we're working on and the end goal]

## Progress Made
[Bullet points of what's been accomplished]

## Key Decisions
[Important choices made and reasoning]

## Current State
[Exactly where we left off, any in-progress work]

## Next Steps
[Prioritized list of what needs to be done next]

## Important Files
[List of files that were modified or are critical to understand]
- path/to/file.ts - description of changes/relevance

## Essential Context
[Any background info, constraints, or gotchas the next session needs to know]

Keep it focused and actionable - this will be my starting context in a fresh session.`;

/**
 * Get the handoff file path for a given session working directory
 */
export function getHandoffPath(cwd: string): string {
  return `${cwd}/.jacques-handoff.md`;
}

/**
 * Get a formatted version of the prompt for display
 */
export function getCompactPromptDisplay(): string {
  return COMPACT_PROMPT;
}
