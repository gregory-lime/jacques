/**
 * Handoff Prompts
 *
 * Prompts for invoking the handoff orchestrator and related operations.
 */

/**
 * The prompt to invoke the handoff orchestrator subagent
 */
export const HANDOFF_INVOCATION = "Use the handoff-orchestrator to prepare for a new session";

/**
 * Get the handoff orchestrator invocation prompt
 */
export function getHandoffPrompt(): string {
  return HANDOFF_INVOCATION;
}

/**
 * Get a display-friendly version of the handoff prompt
 */
export function getHandoffPromptDisplay(): string {
  return HANDOFF_INVOCATION;
}
