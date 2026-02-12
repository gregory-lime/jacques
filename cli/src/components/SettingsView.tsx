/**
 * Settings View Component
 *
 * Displays and allows configuration of settings:
 * - Claude Code connection
 * - Auto-archive toggle
 * - Skip permissions toggle
 * - Sync controls (Sync New / Re-sync All)
 * - Subscription usage visualization
 * - Browse Archive
 */

import React from "react";
import { Text } from "ink";
import {
  HorizontalLayout,
  VerticalLayout,
  ACCENT_COLOR,
  MUTED_TEXT,
  SUCCESS_COLOR,
  WARNING_COLOR,
  ERROR_COLOR,
  HORIZONTAL_LAYOUT_MIN_WIDTH,
  FIXED_CONTENT_HEIGHT,
} from "./layout/index.js";
import { buildBottomControls } from "../utils/bottom-controls.js";
import type { UsageLimits } from "../hooks/useUsageLimits.js";
import type { NotificationSettings, NotificationCategory } from "@jacques/core/notifications";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@jacques/core/notifications";

export interface ArchiveStatsData {
  totalConversations: number;
  totalProjects: number;
  totalSize: string;
  archivePath: string;
}

interface SettingsViewProps {
  terminalWidth: number;
  selectedIndex: number;
  autoArchive: boolean;
  skipPermissions: boolean;
  stats: ArchiveStatsData | null;
  loading?: boolean;
  scrollOffset?: number;
  syncProgress?: string | null;
  usageLimits?: UsageLimits | null;
  usageLoading?: boolean;
  // Claude Connection props
  claudeConnected?: boolean;
  claudeTokenMasked?: string | null;
  claudeTokenInput?: string;
  claudeTokenError?: string | null;
  isTokenInputMode?: boolean;
  isTokenVerifying?: boolean;
  showConnectionSuccess?: boolean;
  // Notification props
  notificationSettings?: NotificationSettings;
  notificationsLoading?: boolean;
}

// Settings items:
// Index 0: Claude Connection
// Index 1: Auto-archive toggle
// Index 2: Skip Permissions toggle
// Index 3: Sync New
// Index 4: Re-sync All
// Index 5: Browse Archive
// Index 6: Notifications master toggle
// Index 7-12: Notification category toggles (8=operation and 12=bug-alert are disabled/skipped)
const TOTAL_ITEMS = 13;

/** Indices that should be skipped during navigation (disabled categories) */
const DISABLED_INDICES = new Set([8, 12]);

const NOTIFICATION_CATEGORIES: { key: NotificationCategory; label: string; disabled?: boolean }[] = [
  { key: "context", label: "Context thresholds" },
  { key: "operation", label: "Large operations", disabled: true },
  { key: "plan", label: "Plan creation" },
  { key: "auto-compact", label: "Auto-compact" },
  { key: "handoff", label: "Handoff ready" },
  { key: "bug-alert", label: "Bug alert", disabled: true },
];

export { TOTAL_ITEMS as SETTINGS_TOTAL_ITEMS, DISABLED_INDICES as SETTINGS_DISABLED_INDICES };

function renderUsageDots(percentage: number): React.ReactNode {
  const total = 10;
  const filled = Math.round((percentage / 100) * total);
  const empty = total - filled;
  const color = percentage < 50 ? SUCCESS_COLOR : percentage < 80 ? WARNING_COLOR : ERROR_COLOR;
  return (
    <Text>
      <Text color={color}>{"\u25CF".repeat(filled)}</Text>
      <Text color={MUTED_TEXT}>{"\u25CB".repeat(empty)}</Text>
    </Text>
  );
}

export function SettingsView({
  terminalWidth,
  selectedIndex,
  autoArchive,
  skipPermissions,
  stats,
  loading = false,
  scrollOffset = 0,
  syncProgress = null,
  usageLimits = null,
  usageLoading = false,
  claudeConnected = false,
  claudeTokenMasked = null,
  claudeTokenInput = "",
  claudeTokenError = null,
  isTokenInputMode = false,
  isTokenVerifying = false,
  showConnectionSuccess = false,
  notificationSettings,
  notificationsLoading = false,
}: SettingsViewProps): React.ReactElement {
  const useHorizontalLayout = terminalWidth >= HORIZONTAL_LAYOUT_MIN_WIDTH;
  const showVersion = terminalWidth >= 70;

  const contentLines: React.ReactNode[] = [];

  // Title
  contentLines.push(
    <Text key="title" bold color={ACCENT_COLOR}>
      Settings
    </Text>
  );
  contentLines.push(<Text key="sep" color={MUTED_TEXT}>{"\u2500".repeat(30)}</Text>);

  // Claude Code Connection section (index 0)
  contentLines.push(<Text key="claude-space"> </Text>);
  contentLines.push(<Text key="claude-label" color={MUTED_TEXT}>Claude Code Connection:</Text>);

  const claudeSelected = selectedIndex === 0;

  if (claudeConnected && claudeTokenMasked) {
    contentLines.push(
      <Text key="claude-val" color={claudeSelected ? ACCENT_COLOR : "white"}>
        {claudeSelected ? "> " : "  "}
        <Text color={SUCCESS_COLOR}>{"\u25CF"}</Text> Connected
        <Text color={MUTED_TEXT}> ({claudeTokenMasked})</Text>
      </Text>
    );
  } else if (isTokenInputMode) {
    contentLines.push(
      <Text key="claude-step1" color={MUTED_TEXT} wrap="truncate">
        {"  "}1. Run: <Text color="white">claude setup-token</Text>
      </Text>
    );
    contentLines.push(
      <Text key="claude-step2" color={MUTED_TEXT} wrap="truncate">
        {"  "}2. Paste token here:
      </Text>
    );
    const maxDisplayLength = 20;
    let displayToken = claudeTokenInput || "";
    if (displayToken.length > maxDisplayLength) {
      displayToken = "..." + displayToken.slice(-maxDisplayLength);
    }
    if (isTokenVerifying) {
      contentLines.push(
        <Text key="claude-verify" color={ACCENT_COLOR} wrap="truncate">
          {"     "}Verifying...
        </Text>
      );
    } else {
      contentLines.push(
        <Text key="claude-input" color={ACCENT_COLOR} wrap="truncate">
          {"     "}{displayToken}_
        </Text>
      );
    }
    if (claudeTokenError) {
      contentLines.push(
        <Text key="claude-err" color={ERROR_COLOR} wrap="truncate">{"     "}{claudeTokenError}</Text>
      );
    }
  } else {
    contentLines.push(
      <Text key="claude-val" color={claudeSelected ? ACCENT_COLOR : "white"}>
        {claudeSelected ? "> " : "  "}
        <Text color={MUTED_TEXT}>{"\u25CB"}</Text> Not connected
        <Text color={MUTED_TEXT}> (press Enter to connect)</Text>
      </Text>
    );
  }

  // Auto-archive toggle (index 1)
  contentLines.push(<Text key="archive-space"> </Text>);
  const autoArchiveSelected = selectedIndex === 1;
  const archiveCheck = autoArchive ? "[x]" : "[ ]";
  contentLines.push(
    <Text key="archive-val" color={autoArchiveSelected ? ACCENT_COLOR : "white"}>
      {autoArchiveSelected ? "> " : "  "}
      {archiveCheck} Auto-archive on session end
    </Text>
  );

  // Skip permissions toggle (index 2)
  const skipSelected = selectedIndex === 2;
  const skipCheck = skipPermissions ? "[x]" : "[ ]";
  contentLines.push(
    <Text key="skip-val" color={skipSelected ? ACCENT_COLOR : "white"}>
      {skipSelected ? "> " : "  "}
      {skipCheck} <Text color={skipPermissions ? ERROR_COLOR : "white"}>Dangerously skip permissions</Text>
    </Text>
  );

  // Sync section (indices 3-4)
  contentLines.push(<Text key="sync-space"> </Text>);
  contentLines.push(<Text key="sync-label" color={MUTED_TEXT}>Sync:</Text>);

  if (syncProgress) {
    contentLines.push(
      <Text key="sync-progress" color={ACCENT_COLOR}>
        {"  "}{syncProgress}
      </Text>
    );
  } else {
    const syncNewSelected = selectedIndex === 3;
    contentLines.push(
      <Text key="sync-new" color={syncNewSelected ? ACCENT_COLOR : "white"}>
        {syncNewSelected ? "> " : "  "}Sync New
      </Text>
    );

    const resyncSelected = selectedIndex === 4;
    contentLines.push(
      <Text key="resync" color={resyncSelected ? ACCENT_COLOR : "white"}>
        {resyncSelected ? "> " : "  "}Re-sync All
      </Text>
    );
  }

  // Usage section
  contentLines.push(<Text key="usage-space"> </Text>);
  contentLines.push(<Text key="usage-label" color={MUTED_TEXT}>Usage:</Text>);

  if (usageLoading) {
    contentLines.push(<Text key="usage-loading" color={MUTED_TEXT}>  Loading...</Text>);
  } else if (usageLimits) {
    if (usageLimits.current) {
      const c = usageLimits.current;
      contentLines.push(
        <Text key="usage-current">
          {"  "}current  {renderUsageDots(c.percentage)}
          <Text color={ACCENT_COLOR}> {c.percentage.toFixed(0)}%</Text>
          <Text color={MUTED_TEXT}> resets {c.resetsAt}</Text>
        </Text>
      );
    }
    if (usageLimits.weekly) {
      const w = usageLimits.weekly;
      contentLines.push(
        <Text key="usage-weekly">
          {"  "}weekly   {renderUsageDots(w.percentage)}
          <Text color={ACCENT_COLOR}> {w.percentage.toFixed(0)}%</Text>
          <Text color={MUTED_TEXT}> resets {w.resetsAt}</Text>
        </Text>
      );
    }
    if (!usageLimits.current && !usageLimits.weekly) {
      contentLines.push(<Text key="usage-none" color={MUTED_TEXT}>  No usage data available</Text>);
    }
  } else {
    contentLines.push(<Text key="usage-none" color={MUTED_TEXT}>  No usage data available</Text>);
  }

  // Browse Archive (index 5)
  contentLines.push(<Text key="browse-space"> </Text>);
  const browseSelected = selectedIndex === 5;
  contentLines.push(
    <Text key="browse-val" color={browseSelected ? ACCENT_COLOR : "white"}>
      {browseSelected ? "> " : "  "}
      Browse Archive
      <Text color={MUTED_TEXT}> (view conversations)</Text>
    </Text>
  );

  // Notifications section (indices 6-14)
  contentLines.push(<Text key="notif-space"> </Text>);
  contentLines.push(<Text key="notif-label" color={MUTED_TEXT}>Notifications:</Text>);

  if (notificationsLoading) {
    contentLines.push(<Text key="notif-loading" color={MUTED_TEXT}>  Loading...</Text>);
  } else {
    const ns = notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS;
    const dimmed = !ns.enabled;

    // Master toggle (index 6)
    const masterSelected = selectedIndex === 6;
    const masterCheck = ns.enabled ? "[x]" : "[ ]";
    contentLines.push(
      <Text key="notif-master" color={masterSelected ? ACCENT_COLOR : "white"}>
        {masterSelected ? "> " : "  "}{masterCheck} Enable notifications
      </Text>
    );

    // Category toggles (indices 7-12)
    for (let i = 0; i < NOTIFICATION_CATEGORIES.length; i++) {
      const cat = NOTIFICATION_CATEGORIES[i];
      const catIndex = 7 + i;
      const catSelected = selectedIndex === catIndex;
      if (cat.disabled) {
        contentLines.push(
          <Text key={`notif-cat-${cat.key}`} color={MUTED_TEXT}>
            {"  "}[ ] {cat.label} <Text color={MUTED_TEXT}>(coming soon)</Text>
          </Text>
        );
      } else {
        const catCheck = ns.categories[cat.key] ? "[x]" : "[ ]";
        contentLines.push(
          <Text key={`notif-cat-${cat.key}`}
                color={catSelected ? ACCENT_COLOR : (dimmed ? MUTED_TEXT : "white")}>
            {catSelected ? "> " : "  "}{catCheck} {cat.label}
          </Text>
        );
      }
    }

  }

  // Apply scroll to content (keep header, scroll body)
  const HEADER_LINES = 2;
  const maxVisible = FIXED_CONTENT_HEIGHT - HEADER_LINES;
  const bodyLines = contentLines.slice(HEADER_LINES);
  const visibleBody = bodyLines.slice(scrollOffset, scrollOffset + maxVisible);
  const finalContent = [...contentLines.slice(0, HEADER_LINES), ...visibleBody];

  // Notification for connection success
  const notification = showConnectionSuccess ? "Connected!" : null;

  const bottomHints = [{ key: "Esc", label: " back" }];
  const { element: bottomControls, width: controlsWidth } = buildBottomControls(bottomHints);

  return useHorizontalLayout ? (
    <HorizontalLayout
      content={finalContent}
      terminalWidth={terminalWidth}
      title="Jacques"
      showVersion={showVersion}
      notification={notification}
      bottomControls={bottomControls}
      bottomControlsWidth={controlsWidth}
    />
  ) : (
    <VerticalLayout
      content={finalContent}
      title="Jacques"
      showVersion={showVersion}
      notification={notification}
      bottomControls={bottomControls}
    />
  );
}

export default SettingsView;
