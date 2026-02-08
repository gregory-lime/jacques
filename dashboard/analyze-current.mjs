#!/usr/bin/env node
/**
 * Deep analysis of current session
 */

import { parseJSONL } from './dist/session/parser.js';
import { countEntryTokens } from './dist/session/token-estimator.js';
import { FilterType, applyFilter } from './dist/session/filters.js';
import { get_encoding } from '@dqbd/tiktoken';

// Find the most recent session
import { readdir, stat } from 'fs/promises';
import { join } from 'path';

const projectDir = join(process.env.HOME, '.claude/projects/-Users-gole-Desktop-jacques-context-manager');

try {
  const files = await readdir(projectDir);
  const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

  let newest = null;
  let newestTime = 0;

  for (const file of jsonlFiles) {
    const filePath = join(projectDir, file);
    const stats = await stat(filePath);
    if (stats.mtimeMs > newestTime) {
      newestTime = stats.mtimeMs;
      newest = filePath;
    }
  }

  console.log('Analyzing:', newest);
  console.log('');

  const entries = await parseJSONL(newest);
  const encoder = get_encoding('cl100k_base');

  // Categorize by type
  const categories = {
    user_messages: [],
    assistant_text: [],
    assistant_thinking: [],
    tool_calls: [],
    tool_results: [],
    hook_progress: [],
    turn_duration: [],
    system_events: [],
    summaries: [],
    unknown: [],
  };

  for (const entry of entries) {
    const tokens = countEntryTokens(entry, encoder);

    if (entry.type === 'user_message') {
      categories.user_messages.push({ tokens, uuid: entry.uuid.substring(0, 8) });
    } else if (entry.type === 'assistant_message') {
      if (entry.content.thinking) {
        const thinkingTokens = encoder.encode(entry.content.thinking).length;
        categories.assistant_thinking.push({ tokens: thinkingTokens, uuid: entry.uuid.substring(0, 8) });
        const textTokens = tokens - thinkingTokens;
        if (textTokens > 0) {
          categories.assistant_text.push({ tokens: textTokens, uuid: entry.uuid.substring(0, 8) });
        }
      } else {
        categories.assistant_text.push({ tokens, uuid: entry.uuid.substring(0, 8) });
      }
    } else if (entry.type === 'tool_call') {
      categories.tool_calls.push({
        tokens,
        uuid: entry.uuid.substring(0, 8),
        tool: entry.content.toolName
      });
    } else if (entry.type === 'tool_result') {
      categories.tool_results.push({
        tokens,
        uuid: entry.uuid.substring(0, 8),
        length: entry.content.toolResultContent?.length || 0
      });
    } else if (entry.type === 'hook_progress') {
      categories.hook_progress.push({ tokens, uuid: entry.uuid.substring(0, 8) });
    } else if (entry.type === 'turn_duration') {
      categories.turn_duration.push({ tokens, uuid: entry.uuid.substring(0, 8) });
    } else if (entry.type === 'system_event') {
      categories.system_events.push({ tokens, uuid: entry.uuid.substring(0, 8) });
    } else if (entry.type === 'summary') {
      categories.summaries.push({ tokens, uuid: entry.uuid.substring(0, 8) });
    } else {
      categories.unknown.push({ tokens, type: entry.type, uuid: entry.uuid.substring(0, 8) });
    }
  }

  // Calculate totals
  let grandTotal = 0;
  const totals = {};

  for (const [cat, items] of Object.entries(categories)) {
    const sum = items.reduce((acc, item) => acc + item.tokens, 0);
    totals[cat] = sum;
    grandTotal += sum;
  }

  console.log('TOKEN BREAKDOWN');
  console.log('='.repeat(80));

  const sorted = Object.entries(totals)
    .map(([cat, tokens]) => ({
      category: cat,
      tokens,
      count: categories[cat].length,
      pct: (tokens / grandTotal * 100).toFixed(1),
    }))
    .sort((a, b) => b.tokens - a.tokens);

  for (const item of sorted) {
    if (item.count === 0) continue;
    const bar = '█'.repeat(Math.floor(item.pct / 2));
    console.log(
      `${item.category.padEnd(22)} ${item.count.toString().padStart(4)} × ${item.tokens.toString().padStart(8)} tokens ${item.pct.padStart(5)}%  ${bar}`
    );
  }

  console.log('\n' + '='.repeat(80));
  console.log(`${'TOTAL'.padEnd(22)} ${entries.length.toString().padStart(4)} × ${grandTotal.toString().padStart(8)} tokens 100.0%`);

  // Now show filter results
  console.log('\n\nFILTER RESULTS');
  console.log('='.repeat(80));

  const everything = applyFilter(entries, FilterType.EVERYTHING);
  const everythingTokens = everything.reduce((sum, e) => sum + countEntryTokens(e, encoder), 0);

  const withoutTools = applyFilter(entries, FilterType.WITHOUT_TOOLS);
  const withoutToolsTokens = withoutTools.reduce((sum, e) => sum + countEntryTokens(e, encoder), 0);

  const messagesOnly = applyFilter(entries, FilterType.MESSAGES_ONLY);
  const messagesOnlyTokens = messagesOnly.reduce((sum, e) => sum + countEntryTokens(e, encoder), 0);

  console.log(`Everything:      ${everything.length.toString().padStart(4)} entries  ${(everythingTokens/1000).toFixed(1).padStart(6)}k tokens`);
  console.log(`Without Tools:   ${withoutTools.length.toString().padStart(4)} entries  ${(withoutToolsTokens/1000).toFixed(1).padStart(6)}k tokens  (saves ${((1 - withoutToolsTokens/everythingTokens)*100).toFixed(0)}%)`);
  console.log(`Messages Only:   ${messagesOnly.length.toString().padStart(4)} entries  ${(messagesOnlyTokens/1000).toFixed(1).padStart(6)}k tokens  (saves ${((1 - messagesOnlyTokens/everythingTokens)*100).toFixed(0)}%)`);

  console.log('\n\nWHAT DID FILTERS REMOVE?');
  console.log('='.repeat(80));

  const removedByWithoutTools = everything.filter(e =>
    !withoutTools.some(w => w.uuid === e.uuid)
  );
  console.log(`\nWithout Tools removed ${removedByWithoutTools.length} entries:`);
  const toolCallsRemoved = removedByWithoutTools.filter(e => e.type === 'tool_call').length;
  const toolResultsRemoved = removedByWithoutTools.filter(e => e.type === 'tool_result').length;
  console.log(`  - tool_call: ${toolCallsRemoved}`);
  console.log(`  - tool_result: ${toolResultsRemoved}`);

  const removedByMessagesOnly = everything.filter(e =>
    !messagesOnly.some(m => m.uuid === e.uuid)
  );
  console.log(`\nMessages Only removed ${removedByMessagesOnly.length} entries:`);
  const byType = {};
  for (const entry of removedByMessagesOnly) {
    byType[entry.type] = (byType[entry.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${type}: ${count}`);
  }

} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
