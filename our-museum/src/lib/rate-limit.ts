/**
 * In-memory token-bucket rate limiter, shared by API routes and the realtime
 * service. State is per process: behind several instances, put a shared store
 * (e.g. Redis) behind the same interface — see docs/SECURITY.md#rate-limiting.
 */
export interface RateLimitRule {
  /** Maximum burst size. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class TokenBucketLimiter {
  private buckets = new Map<string, Bucket>();
  private blockedCount = new Map<string, number>();
  private lastSweep = Date.now();

  constructor(private readonly now: () => number = () => Date.now()) {}

  take(key: string, rule: RateLimitRule, cost = 1): RateLimitResult {
    const t = this.now();
    this.sweep(t);
    const bucket = this.buckets.get(key) ?? { tokens: rule.capacity, updatedAt: t };
    const elapsed = Math.max(0, (t - bucket.updatedAt) / 1000);
    bucket.tokens = Math.min(rule.capacity, bucket.tokens + elapsed * rule.refillPerSecond);
    bucket.updatedAt = t;
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      this.buckets.set(key, bucket);
      return { ok: true, remaining: Math.floor(bucket.tokens), retryAfterSeconds: 0 };
    }
    this.buckets.set(key, bucket);
    const family = key.split(":")[0] ?? key;
    this.blockedCount.set(family, (this.blockedCount.get(family) ?? 0) + 1);
    const missing = cost - bucket.tokens;
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(missing / rule.refillPerSecond)),
    };
  }

  /** Counts of rejected requests per rule family — surfaced in admin diagnostics. */
  stats(): { trackedKeys: number; blocked: Record<string, number> } {
    return { trackedKeys: this.buckets.size, blocked: Object.fromEntries(this.blockedCount) };
  }

  private sweep(t: number) {
    if (t - this.lastSweep < 60_000) return;
    this.lastSweep = t;
    for (const [key, bucket] of this.buckets) {
      if (t - bucket.updatedAt > 10 * 60_000) this.buckets.delete(key);
    }
  }
}

/** Named rules used across the API. */
export const RATE_RULES = {
  api: { capacity: 120, refillPerSecond: 4 },
  mutation: { capacity: 60, refillPerSecond: 2 },
  upload: { capacity: 30, refillPerSecond: 0.5 },
  invitationCreate: { capacity: 20, refillPerSecond: 1 / 30 },
  invitationRedeem: { capacity: 10, refillPerSecond: 1 / 20 },
  realtimeTicket: { capacity: 20, refillPerSecond: 0.5 },
  email: { capacity: 5, refillPerSecond: 1 / 60 },
} satisfies Record<string, RateLimitRule>;
export type RuleName = keyof typeof RATE_RULES;

const g = globalThis as unknown as { __ourMuseumLimiter?: TokenBucketLimiter };
export const apiLimiter: TokenBucketLimiter = g.__ourMuseumLimiter ?? new TokenBucketLimiter();
g.__ourMuseumLimiter = apiLimiter;
