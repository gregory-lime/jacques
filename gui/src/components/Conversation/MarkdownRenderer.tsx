import ReactMarkdown from 'react-markdown';
import { colors } from '../../styles/theme';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={className} style={styles.container}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 style={styles.h1}>{children}</h1>,
          h2: ({ children }) => <h2 style={styles.h2}>{children}</h2>,
          h3: ({ children }) => <h3 style={styles.h3}>{children}</h3>,
          h4: ({ children }) => <h4 style={styles.h4}>{children}</h4>,
          p: ({ children }) => <p style={styles.p}>{children}</p>,
          ul: ({ children }) => <ul style={styles.ul}>{children}</ul>,
          ol: ({ children }) => <ol style={styles.ol}>{children}</ol>,
          li: ({ children }) => <li style={styles.li}>{children}</li>,
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code style={styles.inlineCode}>{children}</code>
            ) : (
              <code style={styles.blockCode}>{children}</code>
            );
          },
          pre: ({ children }) => <pre style={styles.pre}>{children}</pre>,
          blockquote: ({ children }) => <blockquote style={styles.blockquote}>{children}</blockquote>,
          table: ({ children }) => <table style={styles.table}>{children}</table>,
          thead: ({ children }) => <thead style={styles.thead}>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr style={styles.tr}>{children}</tr>,
          th: ({ children }) => <th style={styles.th}>{children}</th>,
          td: ({ children }) => <td style={styles.td}>{children}</td>,
          a: ({ children, href }) => (
            <a href={href} style={styles.a} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          strong: ({ children }) => <strong style={styles.strong}>{children}</strong>,
          em: ({ children }) => <em style={styles.em}>{children}</em>,
          hr: () => <hr style={styles.hr} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: colors.textPrimary,
  },
  h1: {
    fontSize: '24px',
    fontWeight: 700,
    color: colors.textPrimary,
    margin: '0 0 16px 0',
    paddingBottom: '8px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  h2: {
    fontSize: '20px',
    fontWeight: 600,
    color: colors.textPrimary,
    margin: '24px 0 12px 0',
  },
  h3: {
    fontSize: '16px',
    fontWeight: 600,
    color: colors.textPrimary,
    margin: '20px 0 8px 0',
  },
  h4: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.textSecondary,
    margin: '16px 0 8px 0',
  },
  p: {
    margin: '0 0 12px 0',
  },
  ul: {
    margin: '0 0 12px 0',
    paddingLeft: '24px',
  },
  ol: {
    margin: '0 0 12px 0',
    paddingLeft: '24px',
  },
  li: {
    margin: '4px 0',
  },
  inlineCode: {
    backgroundColor: colors.bgElevated,
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: 'monospace',
    color: colors.accent,
  },
  blockCode: {
    display: 'block',
    backgroundColor: colors.bgPrimary,
    padding: '12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: 'monospace',
    color: colors.textSecondary,
    overflow: 'auto',
  },
  pre: {
    margin: '0 0 12px 0',
    backgroundColor: colors.bgPrimary,
    borderRadius: '6px',
    overflow: 'auto',
  },
  blockquote: {
    margin: '0 0 12px 0',
    paddingLeft: '16px',
    borderLeft: `3px solid ${colors.accent}`,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    margin: '0 0 12px 0',
    fontSize: '13px',
  },
  thead: {
    backgroundColor: colors.bgElevated,
  },
  tr: {
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  th: {
    padding: '8px 12px',
    textAlign: 'left' as const,
    fontWeight: 600,
    color: colors.textPrimary,
  },
  td: {
    padding: '8px 12px',
    color: colors.textSecondary,
  },
  a: {
    color: colors.accent,
    textDecoration: 'none',
  },
  strong: {
    fontWeight: 600,
    color: colors.textPrimary,
  },
  em: {
    fontStyle: 'italic',
  },
  hr: {
    border: 'none',
    borderTop: `1px solid ${colors.borderSubtle}`,
    margin: '16px 0',
  },
};
