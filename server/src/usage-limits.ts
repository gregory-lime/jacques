/**
 * Usage Limits — Fetches Anthropic account rate limits via OAuth API
 *
 * Reads Claude Code's stored OAuth credentials and queries the usage endpoint.
 * Results are cached for 30 seconds to avoid excessive API calls.
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { homedir, platform } from 'os';
import { join } from 'path';
import type { UsageLimits } from './types.js';

const USAGE_API_URL = 'https://api.anthropic.com/api/oauth/usage';
const CACHE_TTL_MS = 30_000;

let cachedLimits: UsageLimits | null = null;
let lastFetchTime = 0;

/**
 * Read OAuth access token from Claude Code's credential stores.
 * Tries in order: credentials file, macOS Keychain, environment variable.
 */
function getOAuthToken(): string | null {
  // 1. File-based credentials (~/.claude/.credentials.json)
  try {
    const credPath = join(homedir(), '.claude', '.credentials.json');
    const raw = readFileSync(credPath, 'utf-8');
    const data = JSON.parse(raw);
    const token = data?.claudeAiOauth?.accessToken;
    if (token) return token;
  } catch {
    // File doesn't exist or isn't valid JSON
  }

  // 2. macOS Keychain
  if (platform() === 'darwin') {
    try {
      const result = execSync(
        '/usr/bin/security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
        { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] },
      ).trim();
      if (result) {
        const data = JSON.parse(result);
        const token = data?.claudeAiOauth?.accessToken;
        if (token) return token;
      }
    } catch {
      // Keychain access failed
    }
  }

  // 3. Environment variable
  const envToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (envToken) return envToken;

  return null;
}

/**
 * Fetch usage limits from Anthropic's OAuth API.
 * Returns cached result if within TTL, otherwise makes a fresh API call.
 */
export async function fetchUsageLimits(): Promise<UsageLimits | null> {
  const now = Date.now();

  // Return cache if fresh
  if (cachedLimits && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedLimits;
  }

  const token = getOAuthToken();
  if (!token) return null;

  try {
    const response = await fetch(USAGE_API_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        Accept: 'application/json',
      },
    });

    if (!response.ok) return null;

    const data = await response.json() as Record<string, unknown>;

    const fiveHour = data.five_hour as { utilization?: number; resets_at?: string } | undefined;
    const sevenDay = data.seven_day as { utilization?: number; resets_at?: string } | undefined;
    const extra = data.extra_usage as {
      is_enabled?: boolean;
      utilization?: number;
      used_credits?: number;
      monthly_limit?: number;
      resets_at?: string;
    } | undefined;

    const limits: UsageLimits = {
      fiveHour: fiveHour
        ? { utilization: fiveHour.utilization ?? 0, resetsAt: fiveHour.resets_at ?? '' }
        : null,
      sevenDay: sevenDay
        ? { utilization: sevenDay.utilization ?? 0, resetsAt: sevenDay.resets_at ?? '' }
        : null,
      extraUsage: extra?.is_enabled
        ? {
            isEnabled: true,
            utilization: extra.utilization ?? 0,
            usedCredits: extra.used_credits ?? 0,
            monthlyLimit: extra.monthly_limit ?? 0,
            resetsAt: extra.resets_at ?? '',
          }
        : null,
      fetchedAt: now,
    };

    cachedLimits = limits;
    lastFetchTime = now;
    return limits;
  } catch {
    return cachedLimits;
  }
}
