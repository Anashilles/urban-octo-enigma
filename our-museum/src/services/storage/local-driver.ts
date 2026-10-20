import "server-only";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { storageSigningSecret } from "@/lib/env";
import type { StorageDriver, UploadTarget } from "./types";
import { assertSafeKey, bucketedExpiry, sign } from "./signing";

/**
 * Filesystem storage for development and single-node self-hosting. Files live
 * outside `public/` and are only served by /api/storage/object with a valid,
 * unexpired HMAC signature.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = "local" as const;
  private readonly root: string;

  constructor(dir: string) {
    // Runtime-configured directory: keep it out of build-time file tracing.
    this.root = path.resolve(/*turbopackIgnore: true*/ process.cwd(), dir);
  }

  resolve(key: string): string {
    const full = path.resolve(this.root, assertSafeKey(key));
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, body: Buffer, contentType: string) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType }));
  }

  async get(key: string) {
    return readFile(this.resolve(key));
  }

  async head(key: string) {
    try {
      const s = await stat(this.resolve(key));
      let contentType: string | undefined;
      try {
        contentType = JSON.parse(await readFile(`${this.resolve(key)}.meta.json`, "utf8")).contentType;
      } catch {
        contentType = undefined;
      }
      return { size: s.size, contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    const file = this.resolve(key);
    await rm(file, { force: true });
    await rm(`${file}.meta.json`, { force: true });
  }

  async signedGetUrl(key: string, opts: { expiresInSeconds: number }) {
    assertSafeKey(key);
    const exp = bucketedExpiry(Math.floor(Date.now() / 1000), opts.expiresInSeconds);
    const s = sign(storageSigningSecret(), ["GET", key, exp]);
    return `/api/storage/object?k=${encodeURIComponent(key)}&e=${exp}&s=${s}`;
  }

  async createUploadTarget(key: string, opts: { contentType: string; maxBytes: number; expiresInSeconds: number }): Promise<UploadTarget> {
    assertSafeKey(key);
    const exp = Math.floor(Date.now() / 1000) + opts.expiresInSeconds;
    const s = sign(storageSigningSecret(), ["PUT", key, exp, opts.maxBytes]);
    return {
      url: `/api/storage/upload?k=${encodeURIComponent(key)}&e=${exp}&m=${opts.maxBytes}&s=${s}`,
      method: "PUT",
      headers: { "content-type": opts.contentType },
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  async check() {
    try {
      await mkdir(this.root, { recursive: true });
      const probe = path.join(this.root, ".health");
      await writeFile(probe, String(Date.now()));
      await rm(probe, { force: true });
      return { ok: true, detail: "local filesystem" };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : "unavailable" };
    }
  }
}

/**
 * Type guard by name rather than `instanceof`: the driver is cached on
 * globalThis and each route bundle may carry its own copy of the class.
 */
export function isLocalDriver(driver: StorageDriver): driver is LocalStorageDriver {
  return driver.name === "local";
}
