/**
 * Minimal structured JSON logger. Never pass secrets, tokens, photo contents or
 * full email addresses: known-sensitive keys are redacted as a safety net.
 */
type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE = /pass(word)?|secret|token|authorization|cookie|signature|credential|api[-_]?key/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack?.split("\n").slice(0, 6).join("\n") };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

function threshold(): number {
  const level = (process.env.LOG_LEVEL as Level | undefined) ?? "info";
  return order[level] ?? order.info;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (order[level] < threshold()) return;
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    msg,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};

/**
 * Error-monitoring integration point. Wire Sentry/Datadog/etc. here; see
 * docs/DEPLOYMENT.md#error-monitoring. The default implementation logs.
 */
export function reportError(error: unknown, context?: Record<string, unknown>) {
  logger.error("unhandled_error", { error, ...context });
}
