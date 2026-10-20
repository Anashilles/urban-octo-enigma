import { mkdir, rm, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { apiHandler, json, limit, clientIp } from "@/lib/api/handler";
import { env, storageSigningSecret } from "@/lib/env";
import { errors } from "@/lib/errors";
import { storage } from "@/services/storage";
import { isLocalDriver } from "@/services/storage/local-driver";
import { verify } from "@/services/storage/signing";

/**
 * Upload sink for the local storage driver. Authorised solely by the signed,
 * expiring URL issued by POST /api/museums/:id/uploads. The size limit is
 * enforced while streaming, so oversized bodies are cut off early.
 */
export const PUT = apiHandler(
  async (req) => {
    const driver = storage();
    if (!isLocalDriver(driver)) throw errors.notFound();
    limit(clientIp(req), "upload");
    const url = new URL(req.url);
    const key = url.searchParams.get("k") ?? "";
    const exp = Number(url.searchParams.get("e"));
    const max = Number(url.searchParams.get("m"));
    if (!key.startsWith("incoming/") || !verify(storageSigningSecret(), ["PUT", key, exp, max], url.searchParams.get("s"))) {
      throw errors.forbidden("Invalid upload signature");
    }
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) throw errors.gone("This upload link has expired.");
    const limitBytes = Math.min(max, env().UPLOAD_MAX_BYTES);
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > limitBytes) throw errors.tooLarge("This photo is larger than the upload limit.");
    if (!req.body) throw errors.badRequest("Empty upload");

    const file = driver.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    const out = createWriteStream(file);
    let total = 0;
    try {
      const reader = req.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limitBytes) {
          await reader.cancel();
          throw errors.tooLarge("This photo is larger than the upload limit.");
        }
        if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
      }
      await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
      await writeFile(`${file}.meta.json`, JSON.stringify({ contentType: req.headers.get("content-type") ?? "application/octet-stream" }));
    } catch (error) {
      out.destroy();
      await rm(file, { force: true });
      throw error;
    }
    return json({ ok: true, size: total });
  },
  { skipCsrf: true, skipIpLimit: true },
);
