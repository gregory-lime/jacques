/**
 * Logger
 *
 * Lightweight logger interface for core modules.
 * Silent by default — callers opt into logging by injecting a non-silent logger.
 */

/**
 * Logger interface compatible with server's logger-factory.
 */
export interface Logger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** A logger that does nothing (default for all core functions). */
const silentLogger: Logger = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Create a logger instance.
 *
 * @param options.silent - If true (default), all output is suppressed.
 * @param options.prefix - Optional prefix prepended to all messages (e.g., "[Cache]").
 */
export function createLogger(options?: {
  silent?: boolean;
  prefix?: string;
}): Logger {
  const { silent = true, prefix } = options || {};

  if (silent) {
    return silentLogger;
  }

  const formatArgs = (args: unknown[]): unknown[] => {
    if (prefix && args.length > 0 && typeof args[0] === "string") {
      return [`${prefix} ${args[0]}`, ...args.slice(1)];
    }
    if (prefix) {
      return [prefix, ...args];
    }
    return args;
  };

  return {
    log: (...args) => console.log(...formatArgs(args)),
    warn: (...args) => console.warn(...formatArgs(args)),
    error: (...args) => console.error(...formatArgs(args)),
  };
}
