/**
 * Chat System Prompt Builder
 *
 * Dynamically builds a system prompt for the context catalog chat.
 * Lists available context files, plans, and sessions so Claude
 * can reference and modify them.
 */

import { readProjectIndex } from '@jacques-ai/core';
import type { ProjectIndex } from '@jacques-ai/core';

// Re-export the type so chat-service can use it
export type { ProjectIndex };

/**
 * Build a system prompt for the catalog chat based on project state
 */
export async function buildChatSystemPrompt(projectPath: string): Promise<string> {
  let index: ProjectIndex;
  try {
    index = await readProjectIndex(projectPath);
  } catch {
    index = { version: '1.0.0', updatedAt: '', context: [], sessions: [], plans: [], subagents: [] };
  }

  const parts: string[] = [];

  parts.push(`You are a context management assistant for the project at: ${projectPath}`);
  parts.push('');
  parts.push('Your role is to help the user manage their project context files in the .jacques/context/ directory.');
  parts.push('You can read, create, edit, and organize context files. You can also answer questions about the project context.');
  parts.push('');
  parts.push('When creating or editing files, always work within the .jacques/context/ directory.');
  parts.push('Use markdown format for all context files.');
  parts.push('');

  // List context files
  if (index.context.length > 0) {
    parts.push('## Current Context Files');
    parts.push('');
    for (const file of index.context) {
      const desc = file.description ? ` — ${file.description}` : '';
      const tags = file.tags?.length ? ` [${file.tags.join(', ')}]` : '';
      parts.push(`- **${file.name}** (${file.path})${desc}${tags}`);
    }
    parts.push('');
  }

  // List plans
  if (index.plans.length > 0) {
    parts.push('## Plans');
    parts.push('');
    for (const plan of index.plans) {
      parts.push(`- **${plan.title}** (${plan.path})`);
    }
    parts.push('');
  }

  // List sessions
  if (index.sessions.length > 0) {
    parts.push('## Saved Sessions');
    parts.push('');
    for (const session of index.sessions.slice(0, 5)) {
      parts.push(`- **${session.title}** (${session.savedAt})`);
    }
    if (index.sessions.length > 5) {
      parts.push(`- ... and ${index.sessions.length - 5} more`);
    }
    parts.push('');
  }

  if (index.context.length === 0 && index.plans.length === 0) {
    parts.push('The context catalog is currently empty. Help the user get started by creating context files.');
    parts.push('');
  }

  parts.push('Keep responses concise and focused. When modifying files, explain what you changed.');

  return parts.join('\n');
}
