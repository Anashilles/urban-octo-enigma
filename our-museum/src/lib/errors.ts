/**
 * Domain errors with stable codes. API handlers translate them to
 * `{ error: { code, message, details? } }` with the matching HTTP status and
 * never expose stack traces.
 */
export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "RATE_LIMITED"
  | "GONE"
  | "PLACEMENT_INVALID"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  GONE: 410,
  PLACEMENT_INVALID: 422,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const errors = {
  badRequest: (message = "Bad request", details?: unknown) => new AppError("BAD_REQUEST", message, details),
  validation: (message = "Validation failed", details?: unknown) =>
    new AppError("VALIDATION_FAILED", message, details),
  unauthenticated: (message = "Please sign in to continue") => new AppError("UNAUTHENTICATED", message),
  forbidden: (message = "You do not have permission to do that") => new AppError("FORBIDDEN", message),
  /** Used for resources the caller cannot see — avoids confirming they exist. */
  notFound: (message = "Not found") => new AppError("NOT_FOUND", message),
  conflict: (message: string, details?: unknown) => new AppError("CONFLICT", message, details),
  tooLarge: (message: string) => new AppError("PAYLOAD_TOO_LARGE", message),
  unsupported: (message: string) => new AppError("UNSUPPORTED_MEDIA_TYPE", message),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError("RATE_LIMITED", "Too many requests. Please slow down.", { retryAfterSeconds }),
  gone: (message: string) => new AppError("GONE", message),
  placement: (message: string, details?: unknown) => new AppError("PLACEMENT_INVALID", message, details),
};

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
