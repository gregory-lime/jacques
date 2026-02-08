import { Search } from 'lucide-react';
import { colors } from '../../styles/theme';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  resultCount?: number;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  resultCount,
}: SearchInputProps) {
  return (
    <div style={styles.container}>
      <Search size={14} color={colors.textMuted} style={styles.icon} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={styles.input}
      />
      {resultCount !== undefined && value.length > 0 && (
        <span style={styles.count}>
          {resultCount} result{resultCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    maxWidth: '400px',
  },
  icon: {
    position: 'absolute',
    left: '12px',
    pointerEvents: 'none',
    flexShrink: 0,
  },
  input: {
    width: '100%',
    padding: '10px 14px 10px 36px',
    fontSize: '14px',
    fontFamily: 'inherit',
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '8px',
    color: colors.textPrimary,
    outline: 'none',
    transition: 'border-color 200ms ease, box-shadow 200ms ease',
  },
  count: {
    position: 'absolute',
    right: '12px',
    fontSize: '11px',
    color: colors.textMuted,
    pointerEvents: 'none',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
  },
};
