import { readFile } from "node:fs/promises";
import { apiHandler } from "@/lib/api/handler";
import { storageSigningSecret } from "@/lib/env";
import { errors } from "@/lib/errors";
import { parseRange } from "@/lib/http-range";
import { storage } from "@/services/storage";
import { isLocalDriver } from "@/services/storage/local-driver";
import { verify } from "@/services/storage/signing";

/**
 * Serves private files for the local storage driver. Only requests carrying a
 * valid, unexpired signature (issued after an authorisation check) succeed.
 */
export const GET = apiHandler(
  async (req) => {
    const driver = storage();
    if (!isLocalDriver(driver)) throw errors.notFound();
    const url = new URL(req.url);
    const key = url.searchParams.get("k") ?? "";
    const exp = Number(url.searchParams.get("e"));
    if (!key.startsWith("museums/") || !verify(storageSigningSecret(), ["GET", key, exp], url.searchParams.get("s"))) {
      throw errors.forbidden("Invalid or missing signature");
    }
    const remaining = Math.floor(exp - Date.now() / 1000);
    if (!Number.isFinite(exp) || remaining <= 0) throw errors.forbidden("This link has expired");
    const head = await driver.head(key);
    if (!head) throw errors.notFound();
    const body = await readFile(driver.resolve(key));
    const headers: Record<string, string> = {
      "content-type": head.contentType ?? "application/octet-stream",
      "accept-ranges": "bytes",
      // Private: never stored by shared caches. Same URL stays valid until expiry.
      "cache-control": `private, max-age=${remaining}, immutable`,
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
    };
    // Audio players (Safari in particular) fetch media in byte ranges.
    const range = parseRange(req.headers.get("range"), body.length);
    if (range === "unsatisfiable") {
      return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${body.length}` } });
    }
    if (range) {
      const [start, end] = range;
      return new Response(new Uint8Array(body.subarray(start, end + 1)), {
        status: 206,
        headers: { ...headers, "content-range": `bytes ${start}-${end}/${body.length}`, "content-length": String(end - start + 1) },
      });
    }
    return new Response(new Uint8Array(body), { headers: { ...headers, "content-length": String(body.length) } });
  },
  { skipIpLimit: true },
);
