/**
 * Jacques Color Palette
 *
 * Primary accent derived from mascot's coral/peach skin tone.
 * Designed for dark terminal aesthetic with high readability.
 */
export const colors = {
  // === BACKGROUNDS ===
  /** Primary background - deepest dark */
  bgPrimary: '#0d0d0d',
  /** Secondary background - cards, sidebar */
  bgSecondary: '#1a1a1a',
  /** Elevated surfaces - hover states, modals */
  bgElevated: '#252525',
  /** Input fields, code blocks */
  bgInput: '#2a2a2a',

  // === ACCENT (Coral/Peach) ===
  /** Primary accent - buttons, links, progress */
  accent: '#E67E52',
  /** Lighter accent for hover */
  accentLight: '#F09070',
  /** Darker accent for active states */
  accentDark: '#D06840',
  /** Orange variant - mascot, project names */
  accentOrange: '#FF6600',

  // === TEXT ===
  /** Primary text - headings, body */
  textPrimary: '#ffffff',
  /** Secondary text - descriptions, timestamps */
  textSecondary: '#8B9296',
  /** Muted text - placeholders, disabled */
  textMuted: '#6B7075',

  // === SEMANTIC ===
  /** Success states - connected, saved */
  success: '#4ADE80',
  /** Warning states - approaching limits */
  warning: '#FBBF24',
  /** Error states - disconnected, failed */
  danger: '#EF4444',

  // === BORDERS ===
  /** Default border - matches accent */
  border: '#E67E52',
  /** Subtle border - dividers */
  borderSubtle: '#3a3a3a',

  // === PROGRESS BAR ===
  /** Filled portion */
  progressFill: '#E67E52',
  /** Empty portion */
  progressEmpty: '#8B9296',

  // === WINDOW CHROME ===
  /** macOS red dot */
  dotRed: '#FF5F56',
  /** macOS yellow dot */
  dotYellow: '#FFBD2E',
  /** macOS green dot */
  dotGreen: '#27C93F',
} as const;

export type ColorKey = keyof typeof colors;
