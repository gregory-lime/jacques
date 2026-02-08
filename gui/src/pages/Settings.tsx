import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FolderRoot, Bell, Archive, Plug, RefreshCw, ExternalLink, ShieldOff } from 'lucide-react';
import { colors } from '../styles/theme';
import { SectionHeader, SettingsSection, ToggleSwitch } from '../components/ui';
import { useNotifications } from '../hooks/useNotifications';
import { usePersistedState } from '../hooks/usePersistedState';
import type { NotificationCategory } from '../notifications/types';
import { getRootPath, setRootPath, syncSessions, type RootPathConfig, type SyncProgress, type SyncResult } from '../api/config';
import { useProjectScope } from '../hooks/useProjectScope';

const CATEGORY_LABELS: Record<NotificationCategory, { label: string; description: string }> = {
  context: { label: 'Context thresholds', description: 'Alert at 50%, 70%, 90% usage' },
  operation: { label: 'Large operations', description: 'Claude operations exceeding token threshold' },
  plan: { label: 'Plan creation', description: 'New plan detected in a session' },
  'auto-compact': { label: 'Auto-compact', description: 'Session automatically compacted' },
  handoff: { label: 'Handoff ready', description: 'Handoff file generated for a session' },
};

const PERMISSION_LABELS: Record<string, { text: string; color: string }> = {
  granted: { text: 'Granted', color: colors.success },
  denied: { text: 'Denied (reset in browser settings)', color: colors.danger },
  default: { text: 'Not yet asked', color: colors.textMuted },
  unsupported: { text: 'Not supported in this browser', color: colors.textMuted },
};

export function Settings() {
  const {
    settings,
    updateSettings,
    toggleCategory,
    browserPermission,
    requestBrowserPermission,
  } = useNotifications();

  const { refreshProjects } = useProjectScope();
  const [skipPermissions, setSkipPermissions] = usePersistedState('dangerouslySkipPermissions', false);

  const [thresholdInput, setThresholdInput] = useState(
    String(settings.largeOperationThreshold),
  );

  // Root path state
  const [rootPathConfig, setRootPathConfig] = useState<RootPathConfig | null>(null);
  const [rootPathInput, setRootPathInput] = useState('');
  const [rootPathError, setRootPathError] = useState<string | null>(null);
  const [rootPathSaving, setRootPathSaving] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Load root path config on mount
  useEffect(() => {
    getRootPath()
      .then((config) => {
        setRootPathConfig(config);
        setRootPathInput(config.path);
      })
      .catch((err) => {
        console.error('Failed to load root path:', err);
      });
  }, []);

  const handleSync = (force: boolean) => {
    setIsSyncing(true);
    setSyncProgress(null);
    setSyncResult(null);

    syncSessions({
      onProgress: (progress) => setSyncProgress(progress),
      onComplete: (result) => {
        setSyncResult(result);
        setIsSyncing(false);
        refreshProjects();
        setSyncProgress(null);
      },
      onError: (errorMsg) => {
        console.error('Sync failed:', errorMsg);
        setIsSyncing(false);
        setSyncProgress(null);
      },
    }, { force });
  };

  const handleThresholdBlur = () => {
    const parsed = parseInt(thresholdInput, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      updateSettings({ largeOperationThreshold: parsed });
    } else {
      setThresholdInput(String(settings.largeOperationThreshold));
    }
  };

  const handleRootPathSave = async () => {
    if (!rootPathInput.trim()) {
      setRootPathError('Path cannot be empty');
      return;
    }

    setRootPathSaving(true);
    setRootPathError(null);

    try {
      await setRootPath(rootPathInput.trim());
      const newConfig = await getRootPath();
      setRootPathConfig(newConfig);
      setRootPathInput(newConfig.path);
    } catch (err) {
      setRootPathError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setRootPathSaving(false);
    }
  };

  const permInfo = PERMISSION_LABELS[browserPermission] ?? PERMISSION_LABELS.unsupported;

  return (
    <div style={styles.container}>
      <SectionHeader title="Settings" />
      <p style={styles.description}>
        Configure Jacques preferences and integrations.
      </p>

      {/* Root Catalog Path Section */}
      <SettingsSection
        title="Root Catalog Path"
        icon={<FolderRoot size={16} />}
        description={rootPathConfig ? `Currently: ${rootPathConfig.path}` : 'Loading...'}
        badge={
          rootPathConfig && (
            <span style={{
              fontSize: '11px',
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: '6px',
              color: rootPathConfig.exists ? colors.success : colors.warning,
              backgroundColor: rootPathConfig.exists ? 'rgba(74, 222, 128, 0.15)' : 'rgba(251, 191, 36, 0.15)',
            }}>
              {rootPathConfig.exists ? 'Found' : 'Not Found'}
            </span>
          )
        }
        defaultExpanded={true}
      >
        <div style={styles.settingBlock}>
          <div style={styles.settingLabel}>Claude Data Directory</div>
          <p style={styles.settingDescription}>
            Path to your Claude Code .claude directory where session data is stored.
            {rootPathConfig?.isDefault && (
              <span style={styles.autoDetected}> Auto-detected from default location.</span>
            )}
          </p>
          <div style={styles.pathInputRow}>
            <input
              type="text"
              value={rootPathInput}
              onChange={(e) => setRootPathInput(e.target.value)}
              placeholder={rootPathConfig?.defaultPath || '~/.claude'}
              style={styles.pathInput}
            />
            <button
              style={{
                ...styles.primaryBtn,
                opacity: rootPathSaving ? 0.7 : 1,
              }}
              onClick={handleRootPathSave}
              disabled={rootPathSaving}
            >
              {rootPathSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
          {rootPathError && (
            <div style={styles.errorText}>{rootPathError}</div>
          )}
        </div>
      </SettingsSection>

      {/* Dangerously Skip Permissions Section */}
      <SettingsSection
        title="Dangerously Skip Permissions"
        icon={<ShieldOff size={16} />}
        description={skipPermissions ? 'All launched sessions will skip permission prompts' : 'Sessions launch with normal permissions'}
        badge={
          <span style={{
            fontSize: '11px',
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: '6px',
            color: skipPermissions ? colors.danger : colors.textMuted,
            backgroundColor: skipPermissions ? 'rgba(239, 68, 68, 0.15)' : 'rgba(107, 112, 117, 0.15)',
          }}>
            {skipPermissions ? 'On' : 'Off'}
          </span>
        }
      >
        <ToggleSwitch
          checked={skipPermissions}
          onChange={setSkipPermissions}
          label="Skip all permission prompts"
          description="Launch Claude Code with --dangerously-skip-permissions"
        />
        <div style={styles.settingDescription}>
          When enabled, new Claude Code sessions launched from Jacques will bypass all tool
          approval prompts. Claude will be able to edit files, run commands, and make network
          requests without asking. Only enable this in isolated environments (containers, VMs)
          where unintended changes are acceptable.
        </div>
      </SettingsSection>

      {/* Notifications Section */}
      <SettingsSection
        title="Notifications"
        icon={<Bell size={16} />}
        description={settings.enabled ? 'Enabled' : 'Disabled'}
        badge={
          <span style={{
            fontSize: '11px',
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: '6px',
            color: settings.enabled ? colors.success : colors.textMuted,
            backgroundColor: settings.enabled ? 'rgba(74, 222, 128, 0.15)' : 'rgba(107, 112, 117, 0.15)',
          }}>
            {settings.enabled ? 'On' : 'Off'}
          </span>
        }
      >
        {/* Master toggle */}
        <ToggleSwitch
          checked={settings.enabled}
          onChange={() => updateSettings({ enabled: !settings.enabled })}
          label="Enable notifications"
          description="Show desktop notifications for Claude events"
        />

        {/* Browser permission */}
        <div style={styles.settingBlock}>
          <div style={styles.settingRow}>
            <div>
              <div style={styles.settingLabel}>Browser Permission</div>
              <div style={styles.settingDescription}>
                <span style={{ color: permInfo.color }}>{permInfo.text}</span>
              </div>
            </div>
            <button
              style={{
                ...styles.secondaryBtn,
                opacity: browserPermission === 'granted' || browserPermission === 'unsupported' ? 0.5 : 1,
                cursor: browserPermission === 'granted' || browserPermission === 'unsupported' ? 'default' : 'pointer',
              }}
              onClick={requestBrowserPermission}
              disabled={browserPermission === 'granted' || browserPermission === 'unsupported'}
            >
              Request Permission
            </button>
          </div>
        </div>

        {/* Category toggles */}
        <div style={{
          opacity: settings.enabled ? 1 : 0.4,
          pointerEvents: settings.enabled ? 'auto' : 'none',
        }}>
          <div style={styles.settingLabel}>Categories</div>
          <div style={styles.categoryList}>
            {(Object.keys(CATEGORY_LABELS) as NotificationCategory[]).map((cat) => (
              <ToggleSwitch
                key={cat}
                checked={settings.categories[cat]}
                onChange={() => toggleCategory(cat)}
                label={CATEGORY_LABELS[cat].label}
                description={CATEGORY_LABELS[cat].description}
                size="sm"
              />
            ))}
          </div>
        </div>

        {/* Token threshold */}
        <div style={{
          opacity: settings.enabled && settings.categories.operation ? 1 : 0.4,
          pointerEvents: settings.enabled && settings.categories.operation ? 'auto' : 'none',
        }}>
          <div style={styles.settingRow}>
            <div>
              <div style={styles.settingLabel}>Large operation threshold</div>
              <div style={styles.settingDescription}>Notify when operations exceed this token count</div>
            </div>
            <input
              type="number"
              min={1000}
              step={5000}
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              onBlur={handleThresholdBlur}
              style={styles.numberInput}
            />
          </div>
        </div>
      </SettingsSection>

      {/* Sync Section */}
      <SettingsSection
        title="Sync"
        icon={<Archive size={16} />}
        description="Sync sessions, plans, and subagents from Claude Code transcripts"
      >
        <div style={styles.settingBlock}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              style={{
                ...styles.rebuildBtn,
                opacity: isSyncing ? 0.7 : 1,
                cursor: isSyncing ? 'not-allowed' : 'pointer',
              }}
              onClick={() => handleSync(false)}
              disabled={isSyncing}
            >
              <RefreshCw
                size={14}
                style={{
                  animation: isSyncing ? 'spin 1s linear infinite' : 'none',
                }}
              />
              {isSyncing ? 'Syncing...' : 'Sync New'}
            </button>
            <button
              style={{
                ...styles.secondaryBtn,
                opacity: isSyncing ? 0.7 : 1,
                cursor: isSyncing ? 'not-allowed' : 'pointer',
              }}
              onClick={() => handleSync(true)}
              disabled={isSyncing}
            >
              Re-sync All
            </button>

            <Link to="/archive" style={styles.archiveLink}>
              See Full Archive
              <ExternalLink size={12} style={{ opacity: 0.7 }} />
            </Link>
          </div>

          {syncProgress && (
            <div style={styles.progressContainer}>
              <div style={styles.progressHeader}>
                <span style={styles.progressPhase}>
                  {syncProgress.phase === 'extracting'
                    ? 'Extracting catalogs...'
                    : syncProgress.phase === 'indexing'
                      ? (syncProgress.current?.startsWith('Scanning') ? 'Scanning projects...' : 'Indexing sessions...')
                      : 'Processing...'}
                </span>
                <span style={styles.progressCount}>
                  {syncProgress.completed}/{syncProgress.total}
                </span>
              </div>
              <div style={styles.progressBar}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: syncProgress.total > 0
                      ? `${(syncProgress.completed / syncProgress.total) * 100}%`
                      : '0%',
                  }}
                />
              </div>
              <div style={styles.progressCurrent}>{syncProgress.current}</div>
            </div>
          )}

          {syncResult && !isSyncing && (
            <div style={styles.successBanner}>
              Synced: {syncResult.extracted} extracted, {syncResult.indexed} indexed
              {syncResult.skipped > 0 && `, ${syncResult.skipped} skipped`}
            </div>
          )}

          <span style={{ fontSize: '12px', color: colors.textMuted, marginTop: '8px', display: 'block' }}>
            Extract catalog data and rebuild the session index
          </span>
        </div>
      </SettingsSection>

      {/* Sources Section */}
      <SettingsSection
        title="Sources"
        icon={<Plug size={16} />}
        description="External source integrations"
      >
        <div style={styles.placeholder}>
          Source configuration coming soon
        </div>
      </SettingsSection>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '700px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  description: {
    fontSize: '14px',
    color: colors.textSecondary,
    marginBottom: '8px',
  },
  settingBlock: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  settingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  settingLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: colors.textPrimary,
  },
  settingDescription: {
    fontSize: '12px',
    color: colors.textMuted,
  },
  autoDetected: {
    color: colors.success,
  },
  pathInputRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '4px',
  },
  pathInput: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    outline: 'none',
  },
  primaryBtn: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#ffffff',
    backgroundColor: colors.accent,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'opacity 150ms ease',
    whiteSpace: 'nowrap' as const,
  },
  secondaryBtn: {
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 500,
    color: colors.textPrimary,
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 150ms ease',
  },
  buttonRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  categoryList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    marginTop: '8px',
  },
  numberInput: {
    width: '100px',
    padding: '6px 8px',
    fontSize: '13px',
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '4px',
    outline: 'none',
    textAlign: 'right' as const,
  },
  errorText: {
    fontSize: '12px',
    color: colors.danger,
    marginTop: '4px',
  },
  placeholder: {
    padding: '24px',
    textAlign: 'center' as const,
    backgroundColor: colors.bgElevated,
    borderRadius: '6px',
    color: colors.textMuted,
    fontSize: '13px',
  },
  rebuildBtn: {
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    color: colors.textPrimary,
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 150ms ease',
  },
  archiveLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: 500,
    color: colors.accent,
    backgroundColor: 'transparent',
    border: `1px solid ${colors.accent}40`,
    borderRadius: '6px',
    textDecoration: 'none',
    transition: 'all 150ms ease',
  },
  progressContainer: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: colors.bgElevated,
    borderRadius: '6px',
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  progressPhase: {
    fontSize: '12px',
    color: colors.textPrimary,
    fontWeight: 500,
  },
  progressCount: {
    fontSize: '11px',
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
  },
  progressBar: {
    height: '4px',
    backgroundColor: colors.bgSecondary,
    borderRadius: '2px',
    overflow: 'hidden',
    marginBottom: '6px',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: '2px',
    transition: 'width 200ms ease',
  },
  progressCurrent: {
    fontSize: '11px',
    color: colors.textMuted,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  successBanner: {
    marginTop: '12px',
    padding: '10px 12px',
    backgroundColor: `${colors.success}10`,
    borderRadius: '6px',
    border: `1px solid ${colors.success}30`,
    fontSize: '12px',
    color: colors.success,
  },
};
