/**
 * Context Skill Template
 *
 * Template for the skill file that helps Claude find and use context files.
 */

export const CONTEXT_SKILL_CONTENT = `# Jacques Context

When answering questions, check \`.jacques/index.json\` for relevant context files.

## How to Use

1. Read \`.jacques/index.json\` to see available context
2. If a file's name/description matches the topic, read it from \`.jacques/context/\`
3. Use the content to inform your response
4. Only load files when relevant (token efficiency)

## Index Structure

\`\`\`json
{
  "files": [
    {
      "id": "unique-id",
      "name": "Human-readable name",
      "path": ".jacques/context/filename.md",
      "source": "obsidian",
      "description": "Optional description of content",
      "addedAt": "ISO timestamp"
    }
  ]
}
\`\`\`

## Best Practices

- Check index first before loading files
- Match file names/descriptions to user query
- Load only relevant files to conserve tokens
- Reference the source when using context
`;

export const CONTEXT_SKILL_FILENAME = "context.skill.md";
