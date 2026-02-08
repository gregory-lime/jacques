/**
 * Minimalist Icons
 *
 * SVG-based icons for the terminal aesthetic.
 * All icons are 16x16 by default, monochrome, and use currentColor.
 */

import type { CSSProperties } from 'react';

interface IconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

/**
 * Terminal/Sessions icon - grid of dots
 */
export function SessionsIcon({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={style}
    >
      <circle cx="4" cy="4" r="1.5" fill={color} />
      <circle cx="8" cy="4" r="1.5" fill={color} />
      <circle cx="12" cy="4" r="1.5" fill={color} />
      <circle cx="4" cy="8" r="1.5" fill={color} />
      <circle cx="8" cy="8" r="1.5" fill={color} />
      <circle cx="12" cy="8" r="1.5" fill={color} />
      <circle cx="4" cy="12" r="1.5" fill={color} />
      <circle cx="8" cy="12" r="1.5" fill={color} />
      <circle cx="12" cy="12" r="1.5" fill={color} />
    </svg>
  );
}

/**
 * Tokens icon - stacked bars
 */
export function TokensIcon({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={style}
    >
      <rect x="2" y="10" width="12" height="2" rx="1" fill={color} />
      <rect x="2" y="6" width="9" height="2" rx="1" fill={color} />
      <rect x="2" y="2" width="6" height="2" rx="1" fill={color} />
    </svg>
  );
}

/**
 * Activity icon - pulse line
 */
export function ActivityIcon({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={style}
    >
      <path
        d="M1 8h3l2-5 2 10 2-5h5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Model/CPU icon - chip
 */
export function ModelIcon({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={style}
    >
      <rect x="4" y="4" width="8" height="8" rx="1" stroke={color} strokeWidth="1.5" fill="none" />
      <line x1="6" y1="2" x2="6" y2="4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10" y1="2" x2="10" y2="4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="12" x2="6" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10" y1="12" x2="10" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="6" x2="4" y2="6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="10" x2="4" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="6" x2="14" y2="6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="10" x2="14" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Plan/Document icon - file with lines
 */
export function PlanIcon({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={style}
    >
      <path
        d="M4 2h5l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
      />
      <path d="M9 2v3h3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="5" y1="8" x2="10" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="5" y1="11" x2="8" y2="11" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Handoff icon - arrow passing between two elements
 */
export function HandoffIcon({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={style}
    >
      <rect x="2" y="4" width="4" height="8" rx="1" stroke={color} strokeWidth="1.5" fill="none" />
      <rect x="10" y="4" width="4" height="8" rx="1" stroke={color} strokeWidth="1.5" fill="none" />
      <path
        d="M6 8h4m0 0l-1.5-1.5M10 8l-1.5 1.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Agent icon - robot/bot head
 */
export function AgentIcon({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={style}
    >
      <rect x="3" y="4" width="10" height="9" rx="2" stroke={color} strokeWidth="1.5" fill="none" />
      <circle cx="6" cy="8" r="1" fill={color} />
      <circle cx="10" cy="8" r="1" fill={color} />
      <line x1="8" y1="2" x2="8" y2="4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="1.5" r="0.75" fill={color} />
    </svg>
  );
}

/**
 * Clock/Time icon
 */
export function ClockIcon({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={style}
    >
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" fill="none" />
      <path
        d="M8 5v3l2 2"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Status dot - filled or outline
 */
export function StatusDot({ size = 8, color = 'currentColor', filled = true, style }: IconProps & { filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      style={style}
    >
      {filled ? (
        <circle cx="4" cy="4" r="3" fill={color} />
      ) : (
        <circle cx="4" cy="4" r="2.5" stroke={color} strokeWidth="1" fill="none" />
      )}
    </svg>
  );
}

/**
 * Chevron right - for expandable items
 */
export function ChevronRight({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={style}
    >
      <path
        d="M6 4l4 4-4 4"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * External link icon
 */
export function ExternalLinkIcon({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={style}
    >
      <path
        d="M12 9v3a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h3"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M9 3h4v4M13 3L7 9"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
