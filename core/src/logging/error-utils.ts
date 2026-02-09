/**
 * Error Utilities
 *
 * Safe error classification and message extraction.
 */

/**
 * Check if an error is a "file not found" error (ENOENT).
 */
export function isNotFoundError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code: string }).code === "ENOENT";
  }
  return false;
}

/**
 * Check if an error is a permission error (EACCES or EPERM).
 */
export function isPermissionError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: string }).code;
    return code === "EACCES" || code === "EPERM";
  }
  return false;
}

/**
 * Safely extract a message string from an unknown error value.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  return String(err);
}
