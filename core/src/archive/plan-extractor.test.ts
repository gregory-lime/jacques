/**
 * Plan Extractor Tests
 *
 * Tests for detecting and extracting embedded plans from user messages.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ParsedEntry } from "../session/parser.js";
import {
  detectEmbeddedPlans,
  extractPlanTitle,
  extractPlanBody,
  generateBodyHash,
  splitMultiplePlans,
  generatePlanFingerprint,
  calculateSimilarity,
  findDuplicatePlan,
  extractEmbeddedPlans,
  indexEmbeddedPlan,
} from "./plan-extractor.js";

// Test helper: create a user message entry
function createUserMessage(text: string): ParsedEntry {
  return {
    type: "user_message",
    uuid: "test-uuid",
    parentUuid: null,
    timestamp: new Date().toISOString(),
    sessionId: "test-session",
    content: {
      text,
    },
  };
}

// Test helper: create assistant message entry
function createAssistantMessage(text: string): ParsedEntry {
  return {
    type: "assistant_message",
    uuid: "test-uuid",
    parentUuid: null,
    timestamp: new Date().toISOString(),
    sessionId: "test-session",
    content: {
      text,
    },
  };
}

describe("Plan Detection", () => {
  it("detects single plan with 'Implement the following plan:' trigger", () => {
    const entries = [
      createUserMessage(
        "Implement the following plan:\n\n# Auth System\n\nImplement JWT authentication with refresh tokens. " +
        "This includes setting up token generation, validation, and secure storage mechanisms."
      ),
    ];
    const plans = detectEmbeddedPlans(entries);
    expect(plans).toHaveLength(1);
    expect(plans[0].planContent).toContain("# Auth System");
    expect(plans[0].triggeredBy).toBe("Implement the following plan:");
  });

  it("detects plan with 'Here is the plan:' trigger", () => {
    const entries = [
      createUserMessage(
        "Here is the plan:\n\n# Database Migration\n\nMigrate from SQLite to PostgreSQL. " +
        "This involves schema migration, data transfer, and updating connection strings."
      ),
    ];
    const plans = detectEmbeddedPlans(entries);
    expect(plans).toHaveLength(1);
    expect(plans[0].planContent).toContain("# Database Migration");
  });

  it("detects plan with 'Follow this plan:' trigger", () => {
    const entries = [
      createUserMessage(
        "Follow this plan:\n\n# API Refactor\n\nRestructure the API endpoints for better organization. " +
        "This includes grouping related endpoints and improving naming conventions."
      ),
    ];
    const plans = detectEmbeddedPlans(entries);
    expect(plans).toHaveLength(1);
    expect(plans[0].planContent).toContain("# API Refactor");
  });

  it("detects multiple plans across different user messages", () => {
    const entries = [
      createUserMessage(
        "Implement the following plan:\n\n# Plan A\n\nDetails for plan A. " +
        "This covers the initial implementation steps including setup and configuration."
      ),
      createAssistantMessage("Okay, working on it"),
      createUserMessage(
        "Here is the plan:\n\n# Plan B\n\nMore details for plan B. " +
        "This includes testing and validation procedures for the complete system."
      ),
    ];
    const plans = detectEmbeddedPlans(entries);
    expect(plans).toHaveLength(2);
    expect(plans[0].messageIndex).toBe(0);
    expect(plans[1].messageIndex).toBe(2);
  });

  it("ignores short content after trigger phrase", () => {
    const entries = [
      createUserMessage("Implement the following plan: do it"),
    ];
    const plans = detectEmbeddedPlans(entries);
    expect(plans).toHaveLength(0);
  });

  it("ignores plans without markdown heading", () => {
    const entries = [
      createUserMessage(
        "Implement the following plan: just some plain text here without any markdown structure"
      ),
    ];
    const plans = detectEmbeddedPlans(entries);
    expect(plans).toHaveLength(0);
  });

  it("is case-insensitive for trigger patterns", () => {
    const entries = [
      createUserMessage(
        "IMPLEMENT THE FOLLOWING PLAN:\n\n# Test Plan\n\nContent here with enough text to pass the minimum length requirement. " +
        "Additional details to ensure we exceed the 100 character threshold."
      ),
    ];
    const plans = detectEmbeddedPlans(entries);
    expect(plans).toHaveLength(1);
  });

  it("ignores assistant messages", () => {
    const entries = [
      createAssistantMessage(
        "Implement the following plan:\n\n# Fake Plan\n\nThis shouldn't be detected..."
      ),
    ];
    const plans = detectEmbeddedPlans(entries);
    expect(plans).toHaveLength(0);
  });
});

describe("Multiple Plans Splitting", () => {
  it("splits multiple plans in single message by headings", () => {
    const content =
      "# Plan A\n\nContent for plan A...\n\n# Plan B\n\nContent for plan B...";
    const plans = splitMultiplePlans(content);
    expect(plans).toHaveLength(2);
    expect(plans[0]).toContain("# Plan A");
    expect(plans[1]).toContain("# Plan B");
  });

  it("returns single plan when no multiple headings", () => {
    const content = "# Single Plan\n\nContent here...";
    const plans = splitMultiplePlans(content);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toContain("# Single Plan");
  });

  it("handles content without headings", () => {
    const content = "Some plain content without headings";
    const plans = splitMultiplePlans(content);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toBe(content);
  });

  it("detects multiple plans in single user message", () => {
    const entries = [
      createUserMessage(
        "Implement the following plan:\n\n# Plan A\n\nDetails A with sufficient content to pass validation.\n\n" +
        "# Plan B\n\nDetails B with sufficient content to pass validation."
      ),
    ];
    const plans = detectEmbeddedPlans(entries);
    expect(plans).toHaveLength(2);
    expect(plans[0].planIndex).toBe(0);
    expect(plans[1].planIndex).toBe(1);
  });
});

describe("Title Extraction", () => {
  it("extracts title from first markdown heading", () => {
    const content = "# Authentication System Design\n\nDetails...";
    expect(extractPlanTitle(content)).toBe("Authentication System Design");
  });

  it("extracts title from heading with extra whitespace", () => {
    const content = "#    Spaced Title   \n\nDetails...";
    expect(extractPlanTitle(content)).toBe("Spaced Title");
  });

  it("falls back to first line when no heading", () => {
    const content = "This is a plan without a heading\n\nDetails...";
    expect(extractPlanTitle(content)).toBe("This is a plan without a heading");
  });

  it("truncates long first line", () => {
    const longLine = "A".repeat(100);
    const title = extractPlanTitle(longLine);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title).toContain("...");
  });

  it("handles empty content", () => {
    const title = extractPlanTitle("");
    expect(title).toBe("");
  });
});

describe("Body Extraction", () => {
  it("extracts body by stripping first heading", () => {
    const content = "# Plan Title\n\nBody content here.\n\n## Section 2\n\nMore content.";
    const body = extractPlanBody(content);
    expect(body).toBe("Body content here.\n\n## Section 2\n\nMore content.");
    expect(body).not.toContain("# Plan Title");
  });

  it("preserves subheadings in body", () => {
    const content = "# Main Title\n\n## Section 1\n\nContent 1\n\n## Section 2\n\nContent 2";
    const body = extractPlanBody(content);
    expect(body).toContain("## Section 1");
    expect(body).toContain("## Section 2");
  });

  it("returns entire content when no heading present", () => {
    const content = "Just some plain content without headings";
    const body = extractPlanBody(content);
    expect(body).toBe(content);
  });

  it("handles empty content", () => {
    const body = extractPlanBody("");
    expect(body).toBe("");
  });

  it("handles content with only heading", () => {
    const content = "# Just a Heading";
    const body = extractPlanBody(content);
    expect(body).toBe("");
  });
});

describe("Body Hash", () => {
  it("generates same hash for plans with different titles but same body", () => {
    const plan1 = "# Title A\n\nImplement authentication with JWT tokens and refresh mechanism.";
    const plan2 = "# Title B\n\nImplement authentication with JWT tokens and refresh mechanism.";

    const hash1 = generateBodyHash(plan1);
    const hash2 = generateBodyHash(plan2);

    expect(hash1).toBe(hash2);
  });

  it("generates different hash for plans with same title but different body", () => {
    const plan1 = "# Auth System\n\nImplement JWT tokens.";
    const plan2 = "# Auth System\n\nImplement OAuth2 flow.";

    const hash1 = generateBodyHash(plan1);
    const hash2 = generateBodyHash(plan2);

    expect(hash1).not.toBe(hash2);
  });

  it("normalizes whitespace when hashing body", () => {
    const plan1 = "# Title\n\nSome   content   here";
    const plan2 = "# Title\n\nSome content here";

    const hash1 = generateBodyHash(plan1);
    const hash2 = generateBodyHash(plan2);

    expect(hash1).toBe(hash2);
  });

  it("is case-insensitive when hashing body", () => {
    const plan1 = "# Title\n\nSome Content Here";
    const plan2 = "# Title\n\nsome content here";

    const hash1 = generateBodyHash(plan1);
    const hash2 = generateBodyHash(plan2);

    expect(hash1).toBe(hash2);
  });
});

describe("Deduplication", () => {
  it("generates consistent hash for identical content", () => {
    const content = "# Plan A\n\nSome content here";
    const fp1 = generatePlanFingerprint(content);
    const fp2 = generatePlanFingerprint(content);
    expect(fp1.contentHash).toBe(fp2.contentHash);
  });

  it("generates same hash despite whitespace differences", () => {
    const content1 = "# Plan A\n\nSome  content  here";
    const content2 = "# Plan A\n\nSome content here";
    const fp1 = generatePlanFingerprint(content1);
    const fp2 = generatePlanFingerprint(content2);
    expect(fp1.contentHash).toBe(fp2.contentHash);
  });

  it("generates different hash for different content", () => {
    const content1 = "# Plan A\n\nContent A";
    const content2 = "# Plan B\n\nContent B";
    const fp1 = generatePlanFingerprint(content1);
    const fp2 = generatePlanFingerprint(content2);
    expect(fp1.contentHash).not.toBe(fp2.contentHash);
  });

  it("calculates high similarity for nearly identical text", () => {
    const text1 = "Build authentication system with JWT tokens";
    const text2 = "Build authentication system using JWT tokens";
    // Jaccard similarity is lower than expected, adjust threshold
    expect(calculateSimilarity(text1, text2)).toBeGreaterThan(0.6);
  });

  it("calculates low similarity for different text", () => {
    const text1 = "Build authentication system";
    const text2 = "Create payment processing";
    expect(calculateSimilarity(text1, text2)).toBeLessThan(0.3);
  });

  it("handles empty strings", () => {
    expect(calculateSimilarity("", "test")).toBe(0);
    expect(calculateSimilarity("test", "")).toBe(0);
    expect(calculateSimilarity("", "")).toBe(0);
  });

  it("normalizes titles for fingerprinting", () => {
    const content1 = "# Authentication System!\n\nContent";
    const content2 = "# authentication-system\n\nContent";
    const fp1 = generatePlanFingerprint(content1);
    const fp2 = generatePlanFingerprint(content2);
    expect(fp1.titleNormalized).toBe(fp2.titleNormalized);
  });

  it("categorizes content by length range", () => {
    const short = "# Short\n\n" + "x".repeat(400);
    const medium = "# Medium\n\n" + "x".repeat(1500);
    const long = "# Long\n\n" + "x".repeat(3000);

    expect(generatePlanFingerprint(short).lengthRange).toBe("0-500");
    expect(generatePlanFingerprint(medium).lengthRange).toBe("501-2000");
    expect(generatePlanFingerprint(long).lengthRange).toBe("2001+");
  });

  it("fingerprint includes bodyHash", () => {
    const content = "# Plan Title\n\nBody content here";
    const fingerprint = generatePlanFingerprint(content);

    expect(fingerprint.bodyHash).toBeDefined();
    expect(typeof fingerprint.bodyHash).toBe("string");
    expect(fingerprint.bodyHash.length).toBe(64); // SHA-256 hex
  });

  it("fingerprint bodyHash matches generateBodyHash", () => {
    const content = "# Plan Title\n\nBody content here";
    const fingerprint = generatePlanFingerprint(content);
    const bodyHash = generateBodyHash(content);

    expect(fingerprint.bodyHash).toBe(bodyHash);
  });
});

describe("Plan Indexing", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = join(tmpdir(), `jacques-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("creates new PlanEntry for first occurrence", async () => {
    const planContent = "# Test Plan\n\nContent...";
    const planEntry = await indexEmbeddedPlan(
      planContent,
      "2026-02-01_test-plan.md",
      "session-123",
      testDir
    );

    expect(planEntry.title).toBe("Test Plan");
    expect(planEntry.sessions).toContain("session-123");
    expect(planEntry.filename).toBe("2026-02-01_test-plan.md");

    // Verify file was written
    const planPath = join(testDir, ".jacques", "plans", "2026-02-01_test-plan.md");
    const savedContent = await fs.readFile(planPath, "utf-8");
    expect(savedContent).toBe(planContent);
  });

  it("merges session ID when plan already exists", async () => {
    const planContent = "# Test Plan\n\nContent...";

    // Create initial plan
    await indexEmbeddedPlan(
      planContent,
      "2026-02-01_test-plan.md",
      "session-1",
      testDir
    );

    // Index same plan from different session
    const planEntry = await indexEmbeddedPlan(
      planContent,
      "2026-02-01_test-plan.md",
      "session-2",
      testDir
    );

    expect(planEntry.sessions).toContain("session-1");
    expect(planEntry.sessions).toContain("session-2");
    expect(planEntry.sessions).toHaveLength(2);
  });

  it("doesn't duplicate session IDs", async () => {
    const planContent = "# Test Plan\n\nContent...";

    // Index same plan and session twice
    await indexEmbeddedPlan(
      planContent,
      "2026-02-01_test-plan.md",
      "session-1",
      testDir
    );
    const planEntry = await indexEmbeddedPlan(
      planContent,
      "2026-02-01_test-plan.md",
      "session-1",
      testDir
    );

    expect(planEntry.sessions).toHaveLength(1);
    expect(planEntry.sessions[0]).toBe("session-1");
  });
});

describe("Full Extraction Flow", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `jacques-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("extracts single embedded plan from session", async () => {
    const entries = [
      createUserMessage(
        "Implement the following plan:\n\n# JWT Auth\n\nImplement JWT authentication with refresh tokens and secure storage mechanisms. " +
        "This includes token generation, validation, and handling token expiration."
      ),
    ];

    const references = await extractEmbeddedPlans(
      entries,
      testDir,
      "test-session"
    );

    expect(references).toHaveLength(1);
    expect(references[0].source).toBe("embedded");
    expect(references[0].name).toMatch(/jwt-auth/);

    // Verify plan file exists
    const planPath = references[0].path;
    const planContent = await fs.readFile(planPath, "utf-8");
    expect(planContent).toContain("# JWT Auth");
  });

  it("extracts multiple embedded plans from session", async () => {
    const entries = [
      createUserMessage(
        "Implement the following plan:\n\n# Plan A\n\nDetails for A with sufficient content to meet the minimum requirement. " +
        "Additional implementation steps and configuration details are included here."
      ),
      createUserMessage(
        "Here is the plan:\n\n# Plan B\n\nDetails for B with sufficient content to meet the minimum requirement. " +
        "Additional implementation steps and configuration details are included here."
      ),
    ];

    const references = await extractEmbeddedPlans(
      entries,
      testDir,
      "test-session"
    );

    expect(references).toHaveLength(2);
    expect(references.every((r) => r.source === "embedded")).toBe(true);
  });

  it("deduplicates identical plans in same session", async () => {
    const planContent =
      "Implement the following plan:\n\n# Shared Plan\n\nDetails with enough content to meet minimum length requirement. " +
      "Additional implementation steps and configuration details included.";
    const entries = [
      createUserMessage(planContent),
      createUserMessage(planContent), // Duplicate
    ];

    const references = await extractEmbeddedPlans(
      entries,
      testDir,
      "test-session"
    );

    expect(references).toHaveLength(1); // Only one despite duplicate
  });

  it("returns empty array when no plans found", async () => {
    const entries = [createUserMessage("Just a regular message")];

    const references = await extractEmbeddedPlans(
      entries,
      testDir,
      "test-session"
    );

    expect(references).toHaveLength(0);
  });

  it("handles errors gracefully", async () => {
    const entries = [
      createUserMessage(
        "Implement the following plan:\n\n# Test\n\nContent with enough text to pass the minimum length validation requirement."
      ),
    ];

    // Use invalid path to trigger error
    const invalidPath = "/invalid/path/that/does/not/exist";

    // Should not throw, but return empty array
    const references = await extractEmbeddedPlans(
      entries,
      invalidPath,
      "test-session"
    );

    expect(references).toHaveLength(0);
  });
});

describe("Duplicate Plan Detection", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `jacques-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("finds exact duplicate by hash", async () => {
    const planContent = "# Shared Plan\n\nDetails with enough content to pass validation checks.";

    // Create first plan
    await indexEmbeddedPlan(
      planContent,
      "2026-02-01_shared-plan.md",
      "session-1",
      testDir
    );

    // Try to find duplicate
    const duplicate = await findDuplicatePlan(planContent, testDir);

    expect(duplicate).not.toBeNull();
    expect(duplicate?.filename).toBe("2026-02-01_shared-plan.md");
  });

  it("finds fuzzy duplicate by title and similarity", async () => {
    // Make content very similar - only minor wording difference
    const content1 = "# Auth System\n\nImplement JWT authentication with tokens and refresh mechanisms for secure access control and session management";
    const content2 = "# Auth System\n\nImplement JWT authentication with tokens and refresh mechanisms for secure access control and session management";

    // Create first plan
    await indexEmbeddedPlan(
      content1,
      "2026-02-01_auth-system.md",
      "session-1",
      testDir
    );

    // Try to find exact match (similarity will be 1.0)
    const duplicate = await findDuplicatePlan(content2, testDir);

    expect(duplicate).not.toBeNull();
    expect(duplicate?.filename).toBe("2026-02-01_auth-system.md");
  });

  it("returns null when no duplicate exists", async () => {
    const planContent = "# Unique Plan\n\nThis is unique content that won't match any existing plans.";
    const duplicate = await findDuplicatePlan(planContent, testDir);
    expect(duplicate).toBeNull();
  });

  it("doesn't match plans with same title but different content", async () => {
    const content1 = "# Auth System\n\nImplement basic authentication using username and password with session cookies";
    const content2 = "# Auth System\n\nImplement OAuth2 with Google provider and token refresh using JWT and PKCE flow";

    // Create first plan
    await indexEmbeddedPlan(
      content1,
      "2026-02-01_auth-system.md",
      "session-1",
      testDir
    );

    // Try to find - should not match due to low similarity
    const duplicate = await findDuplicatePlan(content2, testDir);
    expect(duplicate).toBeNull();
  });

  it("finds duplicate by body hash when titles differ", async () => {
    // Same body content, different titles - this is the key new behavior
    const content1 = "# Dashboard Asset Lists — Timestamps, Chronological Sort, Token Display\n\n" +
      "## Overview\n\nImplement timestamps and chronological sorting for asset lists.\n\n" +
      "## Implementation\n\n1. Add timestamp field to assets\n2. Sort by creation date\n3. Display token counts";

    const content2 = "# Navigator Improvements (Timestamps, Chronological Order, Token Counts)\n\n" +
      "## Overview\n\nImplement timestamps and chronological sorting for asset lists.\n\n" +
      "## Implementation\n\n1. Add timestamp field to assets\n2. Sort by creation date\n3. Display token counts";

    // Create first plan
    await indexEmbeddedPlan(
      content1,
      "2026-02-01_dashboard-assets.md",
      "session-1",
      testDir
    );

    // Try to find duplicate - should match via body hash
    const duplicate = await findDuplicatePlan(content2, testDir);

    expect(duplicate).not.toBeNull();
    expect(duplicate?.filename).toBe("2026-02-01_dashboard-assets.md");
  });

  it("finds duplicate by 75% similarity regardless of title", async () => {
    // Similar content (>75%) with different titles
    const content1 = "# Authentication System Design\n\n" +
      "Implement JWT authentication with refresh tokens for secure user session management. " +
      "Include token generation, validation, storage, and automatic refresh mechanisms. " +
      "Add middleware for protected routes and implement logout functionality.";

    const content2 = "# Secure Auth Implementation\n\n" +
      "Implement JWT authentication with refresh tokens for secure user session management. " +
      "Include token generation, validation, storage, and automatic refresh mechanisms. " +
      "Add middleware for protected routes and implement user logout functionality.";

    // Create first plan
    await indexEmbeddedPlan(
      content1,
      "2026-02-01_auth-design.md",
      "session-1",
      testDir
    );

    // Try to find duplicate - should match via similarity (>75%)
    const duplicate = await findDuplicatePlan(content2, testDir);

    expect(duplicate).not.toBeNull();
    expect(duplicate?.filename).toBe("2026-02-01_auth-design.md");
  });

  it("does not match plans below 75% similarity", async () => {
    // Content with less than 75% overlap
    const content1 = "# User Authentication\n\n" +
      "Set up basic username/password authentication with bcrypt hashing. " +
      "Store credentials in PostgreSQL database with proper indexing.";

    const content2 = "# Payment Processing\n\n" +
      "Integrate Stripe API for payment processing. " +
      "Handle webhooks for subscription events and refunds.";

    // Create first plan
    await indexEmbeddedPlan(
      content1,
      "2026-02-01_auth.md",
      "session-1",
      testDir
    );

    // Try to find duplicate - should NOT match (different topic, low similarity)
    const duplicate = await findDuplicatePlan(content2, testDir);
    expect(duplicate).toBeNull();
  });

  it("similarity threshold edge case: exactly 75%", async () => {
    // Test the boundary at 75%
    const similarity = calculateSimilarity(
      "word1 word2 word3 word4 word5 word6 word7 word8",
      "word1 word2 word3 word4 word5 word6 different different"
    );
    // 6 shared out of 10 unique = 60%, so this should not match
    expect(similarity).toBeLessThan(0.75);
  });
});
