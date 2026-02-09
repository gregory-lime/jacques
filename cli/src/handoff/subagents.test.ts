/**
 * Handoff Subagent Integration Tests
 *
 * Verifies that all required subagent files exist and have valid structure.
 * These tests are skipped if the agents directory doesn't exist (e.g., fresh checkout).
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import { promises as fs } from "fs";
import { join } from "path";
import { homedir } from "os";

const AGENTS_DIR = join(homedir(), ".claude", "agents");

const REQUIRED_AGENTS = [
  "handoff-orchestrator",
  "handoff-task-focus",
  "handoff-progress",
  "handoff-decisions",
  "handoff-blockers",
  "handoff-next-steps",
  "handoff-warnings",
];

const EXTRACTOR_AGENTS = REQUIRED_AGENTS.filter(a => a !== "handoff-orchestrator");

// Check if agents are installed
let agentsInstalled = false;

beforeAll(async () => {
  const orchestratorPath = join(AGENTS_DIR, "handoff-orchestrator.md");
  agentsInstalled = await fs.stat(orchestratorPath).then(() => true).catch(() => false);
});

const describeIfAgentsInstalled = () => agentsInstalled ? describe : describe.skip;

describe("Handoff Subagents", () => {
  describe("subagent files", () => {
    it.each(REQUIRED_AGENTS)("should have %s.md file", async (agentName) => {
      if (!agentsInstalled) {
        console.log(`Skipping: agents not installed at ${AGENTS_DIR}`);
        return;
      }
      const filePath = join(AGENTS_DIR, `${agentName}.md`);
      const exists = await fs.stat(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("subagent structure", () => {
    it.each(REQUIRED_AGENTS)("%s should have valid YAML frontmatter", async (agentName) => {
      if (!agentsInstalled) return;
      const filePath = join(AGENTS_DIR, `${agentName}.md`);
      const content = await fs.readFile(filePath, "utf-8");

      // Check frontmatter exists
      expect(content).toMatch(/^---\n/);
      expect(content).toMatch(/\n---\n/);

      // Check required fields
      expect(content).toContain(`name: ${agentName}`);
      expect(content).toContain("description:");
    });

    it("orchestrator should have Task tool", async () => {
      if (!agentsInstalled) return;
      const content = await fs.readFile(
        join(AGENTS_DIR, "handoff-orchestrator.md"),
        "utf-8"
      );
      expect(content).toContain("tools:");
      expect(content).toMatch(/Task/);
    });

    it("orchestrator should have Write tool for saving handoff", async () => {
      if (!agentsInstalled) return;
      const content = await fs.readFile(
        join(AGENTS_DIR, "handoff-orchestrator.md"),
        "utf-8"
      );
      expect(content).toMatch(/Write/);
    });

    it.each(EXTRACTOR_AGENTS)("%s should use haiku model", async (agentName) => {
      if (!agentsInstalled) return;
      const content = await fs.readFile(
        join(AGENTS_DIR, `${agentName}.md`),
        "utf-8"
      );
      expect(content).toContain("model: haiku");
    });

    it.each(EXTRACTOR_AGENTS)("%s should have token budget guidance", async (agentName) => {
      if (!agentsInstalled) return;
      const content = await fs.readFile(
        join(AGENTS_DIR, `${agentName}.md`),
        "utf-8"
      );
      // Each extractor should mention max tokens in output format
      expect(content).toMatch(/max \d+ tokens|Output Format/i);
    });
  });

  describe("orchestrator content", () => {
    it("should reference all extractor agents", async () => {
      if (!agentsInstalled) return;
      const content = await fs.readFile(
        join(AGENTS_DIR, "handoff-orchestrator.md"),
        "utf-8"
      );

      for (const extractor of EXTRACTOR_AGENTS) {
        expect(content).toContain(extractor);
      }
    });

    it("should specify output location", async () => {
      if (!agentsInstalled) return;
      const content = await fs.readFile(
        join(AGENTS_DIR, "handoff-orchestrator.md"),
        "utf-8"
      );
      expect(content).toContain(".jacques/handoffs/");
    });

    it("should describe output format", async () => {
      if (!agentsInstalled) return;
      const content = await fs.readFile(
        join(AGENTS_DIR, "handoff-orchestrator.md"),
        "utf-8"
      );
      expect(content).toContain("# Session Handoff");
      expect(content).toContain("## Current Task");
      expect(content).toContain("## Progress Made");
      expect(content).toContain("## Next Steps");
    });
  });

  describe("extractor outputs", () => {
    it("handoff-task-focus should extract goal and approach", async () => {
      if (!agentsInstalled) return;
      const content = await fs.readFile(
        join(AGENTS_DIR, "handoff-task-focus.md"),
        "utf-8"
      );
      expect(content).toContain("Working on");
      expect(content).toContain("Goal");
      expect(content).toContain("Approach");
    });

    it("handoff-progress should categorize by status", async () => {
      if (!agentsInstalled) return;
      const content = await fs.readFile(
        join(AGENTS_DIR, "handoff-progress.md"),
        "utf-8"
      );
      expect(content).toContain("Completed");
      expect(content).toContain("In Progress");
      expect(content).toContain("Blocked");
    });

    it("handoff-decisions should use table format", async () => {
      if (!agentsInstalled) return;
      const content = await fs.readFile(
        join(AGENTS_DIR, "handoff-decisions.md"),
        "utf-8"
      );
      expect(content).toContain("Decision");
      expect(content).toContain("Reasoning");
    });

    it("handoff-next-steps should prioritize actions", async () => {
      if (!agentsInstalled) return;
      const content = await fs.readFile(
        join(AGENTS_DIR, "handoff-next-steps.md"),
        "utf-8"
      );
      expect(content).toContain("Immediate");
      expect(content).toContain("Short-term");
    });
  });
});
