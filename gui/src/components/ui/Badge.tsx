import type { ReactNode } from 'react';
import {
  FileText,
  Bot,
  Plug,
  Globe,
  Zap,
  GitBranch,
  Play,
  ShieldOff,
  type LucideIcon,
} from 'lucide-react';
import { colors } from '../../styles/theme';

type BadgeVariant =
  | 'plan'
  | 'agent'
  | 'mcp'
  | 'web'
  | 'compacted'
  | 'planning'
  | 'execution'
  | 'bypass'
  | 'focused'
  | 'live'
  | 'idle'
  | 'working'
  | 'default';

type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  icon?: ReactNode;
  size?: BadgeSize;
  onClick?: (e: React.MouseEvent) => void;
}

const variantConfig: Record<
  BadgeVariant,
  { color: string; bg: string; border?: string; Icon?: LucideIcon; dot?: boolean; pulse?: boolean }
> = {
  plan: { color: '#A78BFA', bg: 'rgba(167, 139, 250, 0.15)', border: 'rgba(167, 139, 250, 0.3)', Icon: FileText },
  agent: { color: '#FF6600', bg: 'rgba(255, 102, 0, 0.15)', border: 'rgba(255, 102, 0, 0.3)', Icon: Bot },
  mcp: { color: colors.textSecondary, bg: 'rgba(139, 146, 150, 0.15)', Icon: Plug },
  web: { color: '#60A5FA', bg: 'rgba(96, 165, 250, 0.15)', Icon: Globe },
  compacted: { color: colors.textMuted, bg: 'rgba(107, 112, 117, 0.15)', Icon: Zap },
  planning: { color: '#34D399', bg: 'rgba(52, 211, 153, 0.15)', Icon: GitBranch },
  execution: { color: '#60A5FA', bg: 'rgba(96, 165, 250, 0.15)', Icon: Play },
  bypass: { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', Icon: ShieldOff },
  focused: { color: colors.bgPrimary, bg: colors.accent },
  live: { color: colors.success, bg: 'rgba(74, 222, 128, 0.15)', dot: true, pulse: true },
  idle: { color: colors.textMuted, bg: 'rgba(107, 112, 117, 0.15)', dot: true },
  working: { color: colors.accent, bg: 'rgba(230, 126, 82, 0.15)', dot: true, pulse: true },
  default: { color: colors.textSecondary, bg: 'rgba(139, 146, 150, 0.15)' },
};

export function Badge({ label, variant = 'default', icon, size = 'sm', onClick }: BadgeProps) {
  const config = variantConfig[variant];
  const isSm = size === 'sm';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSm ? '4px' : '6px',
        padding: isSm ? '2px 8px' : '4px 10px',
        fontSize: isSm ? '11px' : '12px',
        fontWeight: 500,
        color: config.color,
        backgroundColor: config.bg,
        border: config.border ? `1px solid ${config.border}` : 'none',
        borderRadius: '6px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 150ms ease',
        whiteSpace: 'nowrap' as const,
        lineHeight: 1.4,
      }}
      onClick={onClick}
    >
      {config.dot && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: config.color,
            animation: config.pulse ? 'pulse-glow 2s ease-in-out infinite' : 'none',
            flexShrink: 0,
          }}
        />
      )}
      {!config.dot && (icon || config.Icon) && (
        <>
          {icon || (config.Icon && <config.Icon size={isSm ? 12 : 14} />)}
        </>
      )}
      {label}
    </span>
  );
}
