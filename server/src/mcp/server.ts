#!/usr/bin/env node
/**
 * Jacques MCP Server
 *
 * Provides cross-project search over archived Claude Code conversations.
 * Communicates via stdio using the Model Context Protocol.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  searchConversationsSchema,
  handleSearchConversations,
} from "./search-tool.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

// ============================================================
// Server Setup
// ============================================================

const server = new McpServer({
  name: "jacques-archive",
  version: pkg.version,
});

// ============================================================
// Tool Registration
// ============================================================

server.tool(
  "search_conversations",
  "Search across all archived Claude Code conversations. Returns matching sessions with metadata including title, project, date, modified files, and technologies. Claude Code provides semantic analysis on the search results.",
  searchConversationsSchema.shape,
  async (args) => {
    const result = await handleSearchConversations(args);
    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  }
);

// ============================================================
// Resource Registration
// ============================================================

server.resource(
  "archive-stats",
  "jacques://archive/stats",
  async () => {
    const { promises: fs } = await import("fs");
    const { homedir } = await import("os");
    const path = await import("path");

    const archivePath = path.join(homedir(), ".jacques", "archive");
    const indexPath = path.join(archivePath, "index.json");

    try {
      const content = await fs.readFile(indexPath, "utf-8");
      const index = JSON.parse(content);

      return {
        contents: [
          {
            uri: "jacques://archive/stats",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                totalConversations: index.metadata.totalConversations,
                totalKeywords: index.metadata.totalKeywords,
                totalProjects: Object.keys(index.projects).length,
                projects: Object.entries(index.projects).map(
                  ([slug, info]: [string, any]) => ({
                    slug,
                    conversationCount: info.conversationCount,
                    lastActivity: info.lastActivity,
                  })
                ),
                lastUpdated: index.lastUpdated,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch {
      return {
        contents: [
          {
            uri: "jacques://archive/stats",
            mimeType: "application/json",
            text: JSON.stringify({
              totalConversations: 0,
              totalKeywords: 0,
              totalProjects: 0,
              projects: [],
              lastUpdated: null,
              note: "Archive not initialized. Save a conversation using Jacques dashboard first.",
            }),
          },
        ],
      };
    }
  }
);

// ============================================================
// Prompt Registration
// ============================================================

server.prompt(
  "search-guide",
  "Guide for searching conversation archives effectively",
  () => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `# Jacques Archive Search Guide

## How to Search

Use the \`search_conversations\` tool to find past Claude Code conversations across all projects.

## Search Tips

1. **Keywords**: Search for specific topics, technologies, or concepts
   - "authentication JWT" finds sessions about JWT auth
   - "react hooks" finds sessions about React hooks

2. **Filter by Project**: Use the \`project\` parameter to limit to a specific project
   - project: "my-app"

3. **Filter by Date**: Use \`dateFrom\` and \`dateTo\` for time ranges
   - dateFrom: "2026-01-01"
   - dateTo: "2026-01-31"

4. **Filter by Technology**: Use \`technologies\` array
   - technologies: ["typescript", "react"]

## Example Searches

- "database migration prisma" - Find sessions about Prisma migrations
- "bug fix authentication" - Find sessions where auth bugs were fixed
- "refactor component" - Find refactoring sessions

## Understanding Results

Each result includes:
- **title**: Claude's summary of the session
- **project**: Which project the session was in
- **date**: When the session ended
- **preview**: First user question
- **filesModified**: Key files that were changed
- **technologies**: Detected tech stack
- **messageCount**: Conversation length
- **durationMinutes**: Session duration

Use these results to find relevant context for your current work!`,
          },
        },
      ],
    };
  }
);

// ============================================================
// Start Server
// ============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with stdio protocol
  console.error("Jacques MCP server started");
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
