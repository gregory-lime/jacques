/**
 * Usage API
 *
 * Claude API usage limits.
 */

import { API_URL } from './client';
import type { UsageLimits } from '../types';

export async function getUsageLimits(): Promise<UsageLimits | null> {
  try {
    const response = await fetch(`${API_URL}/usage`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}
