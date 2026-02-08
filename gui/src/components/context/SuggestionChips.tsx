/**
 * SuggestionChips - Terminal-style command suggestions
 *
 * Minimal chips that look like command hints.
 * Rule-based suggestions from catalog state.
 */

import { Zap } from 'lucide-react';
import { colors } from '../../styles/theme';
import type { ProjectCatalog } from '../../types';

interface SuggestionChipsProps {
  catalog: ProjectCatalog | null;
  onSelect: (text: string) => void;
}

export function SuggestionChips({ catalog, onSelect }: SuggestionChipsProps) {
  const suggestions = generateSuggestions(catalog);

  if (suggestions.length === 0) return null;

  return (
    <div style={styles.container}>
      <div style={styles.label}>
        <Zap size={9} color={colors.textMuted} />
        <span>suggestions</span>
      </div>
      <div style={styles.chips}>
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            style={styles.chip}
            onClick={() => onSelect(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function generateSuggestions(catalog: ProjectCatalog | null): string[] {
  if (!catalog) return [];

  const suggestions: string[] = [];

  if (catalog.context.length === 0 && catalog.plans.length === 0) {
    // Empty catalog
    suggestions.push('how do I add context files?');
    suggestions.push('create a project overview');
  } else {
    if (catalog.context.length > 0) {
      const firstName = catalog.context[0].name;
      suggestions.push(`summarize "${firstName}"`);
      suggestions.push("what's missing from my context?");
    }
    if (catalog.plans.length > 0) {
      suggestions.push('list implementation plans');
    }
    if (catalog.context.length > 2) {
      suggestions.push('create table of contents');
    }
  }

  return suggestions.slice(0, 4);
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: '12px',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    marginBottom: '8px',
    fontSize: '9px',
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: 'lowercase' as const,
    letterSpacing: '0.02em',
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 10px',
    borderRadius: '4px',
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    fontSize: '11px',
    fontFamily: "'JetBrains Mono', monospace",
    cursor: 'pointer',
    transition: 'all 150ms ease',
    whiteSpace: 'nowrap' as const,
    letterSpacing: '-0.02em',
  },
};
