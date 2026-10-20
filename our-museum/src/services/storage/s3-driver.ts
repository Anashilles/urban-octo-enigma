import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageDriver, UploadTarget } from "./types";
import { assertSafeKey, URL_BUCKET_SECONDS } from "./signing";

export interface S3Config {
  endpoint?: string;
  publicEndpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/**
 * S3-compatible private bucket (AWS S3, Cloudflare R2, Supabase Storage's S3
 * endpoint, MinIO…). The bucket must NOT allow public reads.
 */
export class S3StorageDriver implements StorageDriver {
  readonly name = "s3" as const;
  private readonly client: S3Client;
  /** Signs URLs with the host browsers can reach (may differ from the internal endpoint). */
  private readonly signer: S3Client;

  constructor(private readonly config: S3Config) {
    const base = {
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    };
    this.client = new S3Client({ ...base, ...(config.endpoint ? { endpoint: config.endpoint } : {}) });
    const publicEndpoint = config.publicEndpoint ?? config.endpoint;
    this.signer = new S3Client({ ...base, ...(publicEndpoint ? { endpoint: publicEndpoint } : {}) });
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: assertSafeKey(key), Body: body, ContentType: contentType }),
    );
  }

  async get(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: assertSafeKey(key) }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async head(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: assertSafeKey(key) }));
      return { size: Number(res.ContentLength ?? 0), contentType: res.ContentType };
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw e;
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: assertSafeKey(key) }));
  }

  async signedGetUrl(key: string, opts: { expiresInSeconds: number }) {
    // Signing date rounded down to a bucket keeps URLs stable for a few minutes (browser cache friendly).
    const now = Math.floor(Date.now() / 1000);
    const signingDate = new Date(Math.floor(now / URL_BUCKET_SECONDS) * URL_BUCKET_SECONDS * 1000);
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: assertSafeKey(key),
        ResponseCacheControl: `private, max-age=${opts.expiresInSeconds}`,
      }),
      { expiresIn: opts.expiresInSeconds + URL_BUCKET_SECONDS, signingDate },
    );
  }

  async createUploadTarget(key: string, opts: { contentType: string; maxBytes: number; expiresInSeconds: number }): Promise<UploadTarget> {
    const url = await getSignedUrl(
      this.signer,
      new PutObjectCommand({ Bucket: this.config.bucket, Key: assertSafeKey(key), ContentType: opts.contentType }),
      { expiresIn: opts.expiresInSeconds },
    );
    // Size is enforced again server-side when the upload is completed.
    return {
      url,
      method: "PUT",
      headers: { "content-type": opts.contentType },
      expiresAt: new Date(Date.now() + opts.expiresInSeconds * 1000).toISOString(),
    };
  }

  async check() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      return { ok: true, detail: `bucket ${this.config.bucket}` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.name : "unavailable" };
    }
  }
}
