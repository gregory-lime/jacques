/**
 * Content Modal Configuration Factories
 *
 * Creates ContentModalConfig objects for plans, agent results, and web searches.
 */

import { FileText, Search, Bot } from 'lucide-react';
import type { ContentModalConfig } from './ContentModal';

// ─── Plan Modal ──────────────────────────────────────────────

export function planModalConfig(
  title: string,
  source: 'embedded' | 'write' | 'agent',
  content: string,
  filePath?: string,
): ContentModalConfig {
  const sourceLabel = source === 'embedded' ? 'Embedded' : source === 'write' ? 'Written' : 'Agent';
  return {
    title,
    badge: { label: 'Plan', variant: 'plan' },
    icon: <FileText size={16} />,
    subtitle: filePath ? filePath : undefined,
    mode: 'markdown',
    content,
    footerInfo: sourceLabel,
    size: 'lg',
  };
}

// ─── Agent Modal ─────────────────────────────────────────────

export function agentModalConfig(
  agentType: string | undefined,
  prompt: string | undefined,
  responseContent?: string,
): ContentModalConfig {
  const type = agentType?.toLowerCase() || 'agent';
  const label = type === 'explore' ? 'Explore' : type === 'plan' ? 'Plan' : 'Agent';
  const icon = type === 'explore'
    ? <Search size={16} />
    : type === 'plan'
    ? <FileText size={16} />
    : <Bot size={16} />;

  return {
    title: `${label} Agent`,
    badge: { label, variant: 'agent' },
    icon,
    subtitle: prompt ? (prompt.length > 100 ? prompt.slice(0, 100) + '...' : prompt) : undefined,
    mode: 'markdown',
    content: responseContent || '*No response available*',
    size: 'lg',
  };
}

// ─── Context File Modal ──────────────────────────────────────

export function contextFileModalConfig(
  name: string,
  source: string,
  content: string,
  description?: string,
): ContentModalConfig {
  return {
    title: name,
    badge: { label: 'Context', variant: 'agent' },
    icon: <FileText size={16} />,
    subtitle: description,
    mode: 'markdown',
    content,
    footerInfo: source,
    size: 'lg',
  };
}

// ─── Web Search Modal ────────────────────────────────────────

export function webSearchModalConfig(
  query: string,
  resultCount?: number,
  urls?: Array<{ title: string; url: string }>,
  response?: string,
): ContentModalConfig {
  let md = '';

  // Main content: assistant's synthesized response
  if (response) {
    md += response + '\n\n';
  }

  // Sources section: URLs as plain text (not clickable — may be stale/broken)
  if (urls && urls.length > 0) {
    md += '---\n\n';
    md += '**Sources**\n\n';
    urls.forEach((item, i) => {
      md += `${i + 1}. ${item.title}\n   \`${item.url}\`\n`;
    });
  } else if (!response) {
    md += '*Loading search results...*\n';
  }

  return {
    title: 'Web Search',
    badge: { label: 'Search', variant: 'web' },
    icon: <Search size={16} />,
    subtitle: `"${query}"`,
    mode: 'markdown',
    content: md,
    footerInfo: resultCount !== undefined ? `${resultCount} results` : undefined,
    size: 'lg',
  };
}
