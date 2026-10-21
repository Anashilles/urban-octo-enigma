/**
 * Browser-side helper for calling our JSON API with consistent error handling.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T = unknown>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
  const { body, headers, ...rest } = init;
  // Blobs (recordings) are sent as they are; the browser sets their content type.
  const raw = typeof Blob !== "undefined" && body instanceof Blob;
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      ...rest,
      headers: {
        accept: "application/json",
        ...(body !== undefined && !raw ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : raw ? (body as Blob) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("NETWORK", "Network error", 0);
  }
  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
    throw new ApiError(err?.code ?? "INTERNAL", err?.message ?? res.statusText, res.status, err?.details);
  }
  return data as T;
}

/** Maps an error to a translation key under `errors.*`. */
export function errorKey(error: unknown) {
  const code = error instanceof ApiError ? error.code : "INTERNAL";
  const known = [
    "BAD_REQUEST",
    "VALIDATION_FAILED",
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "PAYLOAD_TOO_LARGE",
    "UNSUPPORTED_MEDIA_TYPE",
    "RATE_LIMITED",
    "GONE",
    "PLACEMENT_INVALID",
    "INTERNAL",
    "NETWORK",
  ] as const;
  type Known = (typeof known)[number];
  return `errors.${(known as readonly string[]).includes(code) ? (code as Known) : "INTERNAL"}` as const;
}
