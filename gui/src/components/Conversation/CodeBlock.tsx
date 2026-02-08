import { useState } from 'react';
import { colors } from '../../styles/theme';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  const lineCount = code.split('\n').length;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        {language && <span style={styles.language}>{language}</span>}
        <span style={styles.lineCount}>{lineCount} lines</span>
        <button
          style={styles.copyButton}
          onClick={handleCopy}
          type="button"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre style={styles.code}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderRadius: '6px',
    border: `1px solid ${colors.borderSubtle}`,
    overflow: 'hidden',
    marginTop: '12px',
    marginBottom: '12px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    backgroundColor: colors.bgElevated,
    borderBottom: `1px solid ${colors.borderSubtle}`,
    fontSize: '12px',
  },
  language: {
    color: colors.accent,
    fontWeight: 500,
  },
  lineCount: {
    color: colors.textMuted,
  },
  copyButton: {
    marginLeft: 'auto',
    padding: '4px 8px',
    fontSize: '11px',
    color: colors.textSecondary,
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },
  code: {
    margin: 0,
    padding: '12px',
    backgroundColor: colors.bgInput,
    fontSize: '13px',
    lineHeight: 1.5,
    overflow: 'auto',
    color: colors.textPrimary,
  },
};
