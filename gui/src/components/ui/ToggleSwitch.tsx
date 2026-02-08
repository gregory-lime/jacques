import { colors } from '../../styles/theme';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  label?: string;
  description?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  label,
  description,
}: ToggleSwitchProps) {
  const dimensions = size === 'sm'
    ? { track: { width: 28, height: 16 }, thumb: 12 }
    : { track: { width: 36, height: 20 }, thumb: 16 };

  const handleClick = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!disabled) {
        onChange(!checked);
      }
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onClick={handleClick}
    >
      {(label || description) && (
        <div style={{ flex: 1, minWidth: 0 }}>
          {label && (
            <div style={{
              fontSize: '14px',
              fontWeight: 500,
              color: colors.textPrimary,
            }}>
              {label}
            </div>
          )}
          {description && (
            <div style={{
              fontSize: '12px',
              color: colors.textMuted,
              marginTop: '2px',
            }}>
              {description}
            </div>
          )}
        </div>
      )}
      <div
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        style={{
          position: 'relative',
          width: dimensions.track.width,
          height: dimensions.track.height,
          borderRadius: dimensions.track.height / 2,
          backgroundColor: checked ? colors.accent : colors.bgInput,
          border: `1px solid ${checked ? colors.accent : colors.borderSubtle}`,
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background-color 150ms ease, border-color 150ms ease',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: (dimensions.track.height - dimensions.thumb) / 2 - 1,
            left: checked
              ? dimensions.track.width - dimensions.thumb - (dimensions.track.height - dimensions.thumb) / 2 - 1
              : (dimensions.track.height - dimensions.thumb) / 2 - 1,
            width: dimensions.thumb,
            height: dimensions.thumb,
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
            transition: 'left 150ms ease',
          }}
        />
      </div>
    </div>
  );
}
