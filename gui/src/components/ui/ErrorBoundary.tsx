/**
 * ErrorBoundary — Catches React render errors and shows recovery UI.
 *
 * Place at two levels:
 * - App-level (level="app"): wraps <Routes>, shows "Return to Home" fallback
 * - Route-level (level="route"): wraps <Outlet>, sidebar stays accessible
 */

import React from 'react';
import { colors } from '../../styles/theme';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  level?: 'app' | 'route';
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Jacques] Render error caught by ErrorBoundary:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          gap: '16px',
          color: colors.textSecondary,
          fontFamily: "'JetBrains Mono', monospace",
          minHeight: this.props.level === 'app' ? '100vh' : '200px',
        }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: colors.danger }}>
            Something went wrong
          </span>
          <span style={{
            fontSize: '12px',
            color: colors.textMuted,
            maxWidth: '400px',
            textAlign: 'center',
            lineHeight: 1.5,
          }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </span>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: `1px solid ${colors.accent}`,
              backgroundColor: 'transparent',
              color: colors.accent,
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              marginTop: '8px',
              fontFamily: 'inherit',
            }}
          >
            Try Again
          </button>
          {this.props.level === 'app' && (
            <a
              href="/"
              style={{
                fontSize: '11px',
                color: colors.textMuted,
                textDecoration: 'underline',
                marginTop: '4px',
              }}
            >
              Return to Home
            </a>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
