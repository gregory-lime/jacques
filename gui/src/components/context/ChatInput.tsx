/**
 * ChatInput - Terminal-style prompt input for context chat
 *
 * Features a command-line aesthetic with prompt character.
 * Enter sends, Shift+Enter for newline.
 */

import { useState, useRef, useCallback } from 'react';
import { CornerDownLeft, Square } from 'lucide-react';
import { colors } from '../../styles/theme';

interface ChatInputProps {
  onSend: (text: string) => void;
  onAbort: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onAbort,
  isStreaming,
  disabled = false,
  placeholder = 'ask about your context...',
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    if (!text.trim() || disabled || isStreaming) return;
    onSend(text);
    setText('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, disabled, isStreaming, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  };

  return (
    <div style={styles.container}>
      <div style={styles.inputWrapper}>
        <span style={styles.prompt}>{'>'}</span>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          style={{
            ...styles.textarea,
            opacity: disabled ? 0.4 : 1,
          }}
        />
      </div>
      {isStreaming ? (
        <button
          style={styles.stopButton}
          onClick={onAbort}
          title="Stop (Esc)"
        >
          <Square size={10} fill="currentColor" />
          <span>stop</span>
        </button>
      ) : (
        <button
          style={{
            ...styles.sendButton,
            opacity: text.trim() && !disabled ? 1 : 0.3,
            pointerEvents: text.trim() && !disabled ? 'auto' : 'none',
          }}
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          title="Send (Enter)"
        >
          <CornerDownLeft size={12} />
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '10px',
  },
  inputWrapper: {
    flex: 1,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '10px 14px',
    backgroundColor: colors.bgSecondary,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    transition: 'border-color 150ms ease',
  },
  prompt: {
    color: colors.accent,
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    lineHeight: '20px',
    flexShrink: 0,
    userSelect: 'none',
  },
  textarea: {
    flex: 1,
    padding: 0,
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', monospace",
    backgroundColor: 'transparent',
    border: 'none',
    color: colors.textPrimary,
    outline: 'none',
    resize: 'none' as const,
    lineHeight: '20px',
    maxHeight: '100px',
    letterSpacing: '-0.02em',
  },
  sendButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    backgroundColor: colors.bgSecondary,
    color: colors.textMuted,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 150ms ease',
  },
  stopButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    height: 32,
    padding: '0 12px',
    border: `1px solid rgba(239, 68, 68, 0.3)`,
    borderRadius: '6px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: colors.danger,
    cursor: 'pointer',
    flexShrink: 0,
    fontSize: '10px',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 500,
    transition: 'all 150ms ease',
  },
};
