/**
 * UsageLimits — Displays Anthropic account rate limits with circle indicators.
 *
 * Shows three metrics: current (5h), weekly (7d), and extra credits.
 * Each with filled/empty dot indicators, percentage, and reset time.
 */

import { useState, useEffect, useCallback } from 'react';
import { colors } from '../styles/theme';
import { getUsageLimits } from '../api';
import type { UsageLimits as UsageLimitsType } from '../types';

const POLL_INTERVAL = 30_000;
const DOT_COUNT = 10;

// ─── Colors ──────────────────────────────────────────────────

const LIMIT_COLORS = {
  current: colors.warning,   // yellow — matches screenshot
  weekly: colors.success,    // green
  extra: colors.success,     // green
} as const;

const EMPTY_DOT_COLOR = 'rgba(255,255,255,0.15)';

// ─── Reset Time Formatting ──────────────────────────────────

function formatResetTime(isoString: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  // If reset is today, show time only
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).toLowerCase();
  }

  // If within 7 days, show "feb 13, 11:29pm" style
  if (diffMs > 0 && diffMs < 7 * 24 * 60 * 60 * 1000) {
    const month = date.toLocaleString('en-US', { month: 'short' }).toLowerCase();
    const day = date.getDate();
    const time = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).toLowerCase();
    return `${month} ${day}, ${time}`;
  }

  // Otherwise show "mar 1" style
  const month = date.toLocaleString('en-US', { month: 'short' }).toLowerCase();
  const day = date.getDate();
  return `${month} ${day}`;
}

// ─── Dot Indicator ──────────────────────────────────────────

function DotIndicator({ utilization, color }: { utilization: number; color: string }) {
  // API returns 0-100 (percentage), normalize to 0-1 for dot count
  const normalized = utilization > 1 ? utilization / 100 : utilization;
  const filled = Math.round(normalized * DOT_COUNT);

  return (
    <span style={styles.dots}>
      {Array.from({ length: DOT_COUNT }, (_, i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: i < filled ? color : EMPTY_DOT_COLOR,
            display: 'inline-block',
          }}
        />
      ))}
    </span>
  );
}

// ─── Limit Item ─────────────────────────────────────────────

function LimitItem({
  label,
  utilization,
  valueText,
  resetTime,
  color,
}: {
  label: string;
  utilization: number;
  valueText: string;
  resetTime: string;
  color: string;
}) {
  const resetStr = formatResetTime(resetTime);

  return (
    <div style={styles.limitItem}>
      <div style={styles.limitRow}>
        <span style={styles.limitLabel}>{label}</span>
        <DotIndicator utilization={utilization} color={color} />
        <span style={{ ...styles.limitValue, color }}>{valueText}</span>
      </div>
      {resetStr && (
        <span style={styles.resetText}>resets {resetStr}</span>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function UsageLimits() {
  const [limits, setLimits] = useState<UsageLimitsType | null>(null);

  const refresh = useCallback(async () => {
    const data = await getUsageLimits();
    if (data) setLimits(data);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!limits) return null;

  const hasFiveHour = limits.fiveHour !== null;
  const hasSevenDay = limits.sevenDay !== null;
  const hasExtra = limits.extraUsage !== null;

  if (!hasFiveHour && !hasSevenDay && !hasExtra) return null;

  return (
    <div style={styles.container}>
      {hasFiveHour && (
        <LimitItem
          label="current"
          utilization={limits.fiveHour!.utilization}
          valueText={`${Math.round(limits.fiveHour!.utilization > 1 ? limits.fiveHour!.utilization : limits.fiveHour!.utilization * 100)}%`}
          resetTime={limits.fiveHour!.resetsAt}
          color={LIMIT_COLORS.current}
        />
      )}

      {hasFiveHour && hasSevenDay && <div style={styles.divider} />}

      {hasSevenDay && (
        <LimitItem
          label="weekly"
          utilization={limits.sevenDay!.utilization}
          valueText={`${Math.round(limits.sevenDay!.utilization > 1 ? limits.sevenDay!.utilization : limits.sevenDay!.utilization * 100)}%`}
          resetTime={limits.sevenDay!.resetsAt}
          color={LIMIT_COLORS.weekly}
        />
      )}

      {(hasFiveHour || hasSevenDay) && hasExtra && <div style={styles.divider} />}

      {hasExtra && (
        <LimitItem
          label="extra"
          utilization={limits.extraUsage!.utilization}
          valueText={`$${limits.extraUsage!.usedCredits.toFixed(0)}/$${limits.extraUsage!.monthlyLimit.toFixed(0)}`}
          resetTime={limits.extraUsage!.resetsAt}
          color={LIMIT_COLORS.extra}
        />
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '20px',
    flexShrink: 0,
  },
  limitItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  limitRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  limitLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
  },
  dots: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
  },
  limitValue: {
    fontSize: '11px',
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
  },
  resetText: {
    fontSize: '10px',
    color: colors.textMuted,
    opacity: 0.6,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    paddingLeft: '0px',
  },
  divider: {
    width: '1px',
    height: '28px',
    backgroundColor: colors.borderSubtle,
    alignSelf: 'center',
    opacity: 0.4,
  },
};
