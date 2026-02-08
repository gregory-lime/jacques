/**
 * Claude Token Management
 *
 * Validates, stores, and retrieves Claude OAuth tokens.
 * Tokens are stored in ~/.jacques/config.json (user's home, NOT in git).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";

const JACQUES_CONFIG_PATH = join(homedir(), ".jacques", "config.json");

/**
 * Validate OAuth token format
 * Valid tokens start with: sk-ant-oat01- (OAuth) or sk-ant-api03- (API key)
 */
export function validateToken(token: string): { valid: boolean; error?: string } {
  if (!token || token.trim().length === 0) {
    return { valid: false, error: "Token is required" };
  }

  const trimmed = token.trim();

  if (!trimmed.startsWith("sk-")) {
    return { valid: false, error: "Not a valid token (must start with sk-)" };
  }

  if (trimmed.length < 20) {
    return { valid: false, error: "Token is too short" };
  }

  return { valid: true };
}

/**
 * Read Jacques config (synchronous)
 */
function readConfig(): Record<string, unknown> {
  try {
    if (!existsSync(JACQUES_CONFIG_PATH)) {
      return {};
    }
    const content = readFileSync(JACQUES_CONFIG_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Write Jacques config (synchronous)
 */
function writeConfig(config: Record<string, unknown>): void {
  const dir = dirname(JACQUES_CONFIG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(JACQUES_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Save Claude token to Jacques config
 * Stored in ~/.jacques/config.json (in user's home directory, NOT in git)
 */
export function saveClaudeToken(token: string): void {
  const validation = validateToken(token);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const config = readConfig();
  config.claudeToken = token.trim();
  writeConfig(config);
}

/**
 * Get stored Claude token
 */
export function getClaudeToken(): string | null {
  const config = readConfig();
  const token = config.claudeToken;
  if (typeof token === "string" && token.length > 0) {
    return token;
  }
  return null;
}

/**
 * Check if Claude token is configured and valid
 */
export function isClaudeConnected(): boolean {
  const token = getClaudeToken();
  if (!token) return false;
  return validateToken(token).valid;
}

/**
 * Mask token for display (show first 10 and last 4 chars)
 * sk-ant-oat01-abc...xyz9
 */
export function maskToken(token: string): string {
  if (token.length <= 15) return "***";
  return `${token.substring(0, 10)}...${token.substring(token.length - 4)}`;
}

/**
 * Remove Claude token from config
 */
export function disconnectClaude(): void {
  const config = readConfig();
  delete config.claudeToken;
  writeConfig(config);
}

/**
 * Verify token is valid by making a minimal API call to Anthropic
 * Returns { valid: true } if token works, { valid: false, error: string } if not
 *
 * Note: OAuth tokens (sk-ant-oat01-) from `claude setup-token` cannot be verified
 * via the public API - they're for Claude Code's internal use. We accept them
 * based on format validation only.
 */
export async function verifyToken(token: string): Promise<{ valid: boolean; error?: string }> {
  // First check format
  const formatCheck = validateToken(token);
  if (!formatCheck.valid) {
    return formatCheck;
  }

  const trimmedToken = token.trim();

  // OAuth tokens (sk-ant-oat01-) cannot be verified via the public API
  // They use a different auth mechanism specific to Claude Code
  // Accept them based on format validation only
  if (trimmedToken.startsWith("sk-ant-oat01-")) {
    return { valid: true };
  }

  // For API keys, verify via the API
  try {
    // Make a minimal API request to verify the token
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": trimmedToken,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    // 401 = invalid/expired token
    if (response.status === 401) {
      const data = await response.json().catch(() => ({}));
      const message = (data as { error?: { message?: string } })?.error?.message || "Invalid or expired token";
      return { valid: false, error: message };
    }

    // 403 = token doesn't have permission (but is valid)
    if (response.status === 403) {
      const data = await response.json().catch(() => ({}));
      const message = (data as { error?: { message?: string } })?.error?.message || "Token lacks required permissions";
      return { valid: false, error: message };
    }

    // 200 = success, token is valid
    // 400 = bad request but token is valid (validation error)
    // 429 = rate limited but token is valid
    if (response.status === 200 || response.status === 400 || response.status === 429) {
      return { valid: true };
    }

    // Other errors
    return { valid: false, error: `Unexpected response: ${response.status}` };
  } catch (err) {
    // Network error
    return {
      valid: false,
      error: `Network error: ${err instanceof Error ? err.message : "Failed to connect"}`
    };
  }
}
