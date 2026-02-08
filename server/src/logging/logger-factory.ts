/**
 * Logger Factory
 *
 * Provides injectable logging for server components.
 * Replaces duplicated logging boilerplate across modules.
 */

/**
 * Logger interface for dependency injection
 */
export interface Logger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Options for creating a logger
 */
export interface LoggerOptions {
  /** Suppress all output */
  silent?: boolean;
  /** Optional prefix prepended to all log messages */
  prefix?: string;
}

/**
 * Create a logger instance
 *
 * @param options Logger configuration options
 * @returns Logger instance
 *
 * @example
 * // Silent logger (no output)
 * const logger = createLogger({ silent: true });
 *
 * @example
 * // Logger with prefix
 * const logger = createLogger({ prefix: 'MyComponent' });
 * logger.log('Hello'); // Output: [MyComponent] Hello
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const { silent = false, prefix } = options;

  if (silent) {
    return {
      log: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  const formatArgs = (args: unknown[]): unknown[] => {
    if (prefix) {
      return [`[${prefix}]`, ...args];
    }
    return args;
  };

  return {
    log: (...args) => console.log(...formatArgs(args)),
    warn: (...args) => console.warn(...formatArgs(args)),
    error: (...args) => console.error(...formatArgs(args)),
  };
}

/**
 * Create a logger from a silent flag (backward compatibility helper)
 *
 * This allows components to accept either a Logger or a silent boolean
 * for backward compatibility during the migration.
 *
 * @param silentOrLogger Either a boolean (silent flag) or a Logger instance
 * @param prefix Optional prefix if creating from boolean
 * @returns Logger instance
 */
export function resolveLogger(
  silentOrLogger: boolean | Logger | undefined,
  prefix?: string
): Logger {
  if (typeof silentOrLogger === 'object' && silentOrLogger !== null) {
    return silentOrLogger;
  }
  return createLogger({ silent: silentOrLogger, prefix });
}
