import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { colors } from '../styles/theme';
import { TerminalPanel, Badge, SectionHeader } from '../components/ui';
import { getSourcesStatus } from '../api';
import type { SourcesStatus } from '../api';

export function Sources() {
  const [sourceStatus, setSourceStatus] = useState<SourcesStatus>({
    obsidian: { connected: false },
    googleDocs: { connected: false },
    notion: { connected: false },
  });

  useEffect(() => {
    async function loadSourceStatus() {
      try {
        const status = await getSourcesStatus();
        setSourceStatus(status);
      } catch (error) {
        console.error('Failed to load source status:', error);
      }
    }
    loadSourceStatus();
  }, []);

  const sources = [
    {
      key: 'obsidian' as const,
      label: 'Obsidian',
      filename: 'obsidian.md',
      description: 'Connect to your Obsidian vault to import markdown notes as context.',
    },
    {
      key: 'googleDocs' as const,
      label: 'Google Docs',
      filename: 'google-docs.api',
      description: 'Import documents from Google Docs (coming soon).',
    },
    {
      key: 'notion' as const,
      label: 'Notion',
      filename: 'notion.api',
      description: 'Import pages from Notion workspaces (coming soon).',
    },
  ];

  return (
    <div style={styles.container}>
      <SectionHeader title="Sources" />
      <p style={styles.description}>
        Connect external knowledge sources to enrich your project context.
      </p>

      <div style={styles.grid}>
        {sources.map(({ key, label, filename, description }) => (
          <TerminalPanel
            key={key}
            title={filename}
            showDots={true}
            headerRight={
              <Badge
                label={sourceStatus[key].connected ? 'Connected' : 'Not connected'}
                variant={sourceStatus[key].connected ? 'live' : 'idle'}
              />
            }
          >
            <h3 style={styles.sourceTitle}>{label}</h3>
            <p style={styles.sourceDescription}>{description}</p>
            <button style={styles.configButton} type="button">
              <Link2 size={14} />
              {sourceStatus[key].connected ? 'Configure' : 'Connect'}
            </button>
          </TerminalPanel>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '1200px',
  },
  description: {
    fontSize: '14px',
    color: colors.textSecondary,
    marginBottom: '24px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
  },
  sourceTitle: {
    fontSize: '16px',
    fontWeight: 500,
    color: colors.textPrimary,
    margin: '0 0 8px 0',
  },
  sourceDescription: {
    fontSize: '13px',
    color: colors.textMuted,
    lineHeight: 1.5,
    margin: '0 0 16px 0',
  },
  configButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    backgroundColor: colors.bgElevated,
    color: colors.textSecondary,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },
};
