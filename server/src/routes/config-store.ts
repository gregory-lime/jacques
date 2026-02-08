/**
 * Jacques configuration read/write
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const JACQUES_DIR = join(homedir(), '.jacques');
const JACQUES_CONFIG_PATH = join(JACQUES_DIR, 'config.json');

export interface JacquesConfig {
  version: string;
  rootPath?: string;
  sources: {
    obsidian?: {
      enabled?: boolean;
      vaultPath?: string;
      configuredAt?: string;
    };
    googleDocs?: {
      enabled?: boolean;
      client_id?: string;
      client_secret?: string;
      tokens?: {
        access_token: string;
        refresh_token?: string;
        expires_at?: number;
      };
      connected_email?: string;
      configured_at?: string;
    };
    notion?: {
      enabled?: boolean;
      client_id?: string;
      client_secret?: string;
      tokens?: {
        access_token: string;
      };
      workspace_id?: string;
      workspace_name?: string;
      configured_at?: string;
    };
  };
}

export function getDefaultConfig(): JacquesConfig {
  return {
    version: '1.0.0',
    sources: {
      obsidian: { enabled: false },
      googleDocs: { enabled: false },
      notion: { enabled: false },
    },
  };
}

export function getJacquesConfig(): JacquesConfig {
  try {
    if (!existsSync(JACQUES_CONFIG_PATH)) {
      return getDefaultConfig();
    }
    const content = readFileSync(JACQUES_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    return {
      version: parsed.version || '1.0.0',
      rootPath: parsed.rootPath,
      sources: {
        obsidian: parsed.sources?.obsidian || { enabled: false },
        googleDocs: parsed.sources?.googleDocs || { enabled: false },
        notion: parsed.sources?.notion || { enabled: false },
      },
    };
  } catch {
    return getDefaultConfig();
  }
}

export function saveJacquesConfig(config: JacquesConfig): boolean {
  try {
    if (!existsSync(JACQUES_DIR)) {
      mkdirSync(JACQUES_DIR, { recursive: true });
    }
    writeFileSync(JACQUES_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}
