/**
 * Search and archive-stats commands.
 */

import { searchConversations, getArchiveStats } from "@jacques-ai/core";

export async function searchArchive(
  query: string,
  options: {
    project?: string;
    from?: string;
    to?: string;
    tech?: string[];
    limit: string;
    json?: boolean;
  },
): Promise<void> {
  const limit = parseInt(options.limit, 10) || 10;

  const result = await searchConversations({
    query,
    project: options.project,
    dateFrom: options.from,
    dateTo: options.to,
    technologies: options.tech,
    limit,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Human-readable output
  console.log(`\nSearch: "${query}"`);
  if (Object.values(result.filters).some((v) => v)) {
    const filters: string[] = [];
    if (result.filters.project)
      filters.push(`project=${result.filters.project}`);
    if (result.filters.dateFrom)
      filters.push(`from=${result.filters.dateFrom}`);
    if (result.filters.dateTo) filters.push(`to=${result.filters.dateTo}`);
    if (result.filters.technologies?.length) {
      filters.push(`tech=${result.filters.technologies.join(",")}`);
    }
    console.log(`Filters: ${filters.join(" ")}`);
  }
  console.log(
    `Results: ${result.totalMatches} total, showing ${result.showing.from}-${result.showing.to}`,
  );
  console.log("");

  if (result.results.length === 0) {
    console.log("No matching conversations found.");
    console.log("");
    console.log("Tips:");
    console.log("  - Try different keywords");
    console.log(
      "  - Save more conversations using the Jacques dashboard",
    );
    return;
  }

  for (const r of result.results) {
    console.log(`${r.rank}. ${r.title}`);
    console.log(
      `   Project: ${r.project} | Date: ${r.date} | ${r.messageCount} messages`,
    );
    if (r.technologies.length > 0) {
      console.log(`   Tech: ${r.technologies.join(", ")}`);
    }
    if (r.filesModified.length > 0) {
      const files = r.filesModified.slice(0, 3);
      console.log(
        `   Files: ${files.join(", ")}${r.filesModified.length > 3 ? "..." : ""}`,
      );
    }
    if (r.preview) {
      const preview =
        r.preview.length > 80
          ? r.preview.substring(0, 77) + "..."
          : r.preview;
      console.log(`   Preview: "${preview}"`);
    }
    console.log("");
  }

  if (result.hasMore) {
    console.log(`Use --limit ${limit + 10} to see more results.`);
  }
}

export async function showArchiveStats(): Promise<void> {
  const stats = await getArchiveStats();

  console.log("\nJacques Archive Statistics");
  console.log("─".repeat(30));
  console.log(`Conversations: ${stats.totalConversations}`);
  console.log(`Projects: ${stats.totalProjects}`);
  console.log(`Total size: ${stats.sizeFormatted}`);
  console.log("");

  if (stats.totalConversations === 0) {
    console.log("No conversations archived yet.");
    console.log("Use the Jacques dashboard to save conversations.");
  }
}
