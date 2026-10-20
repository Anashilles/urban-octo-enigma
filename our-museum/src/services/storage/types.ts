export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

/**
 * Private object storage. Objects are never public: reads go through
 * short-lived signed URLs issued after an authorisation check.
 */
export interface StorageDriver {
  readonly name: "local" | "s3";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  head(key: string): Promise<{ size: number; contentType?: string } | null>;
  delete(key: string): Promise<void>;
  signedGetUrl(key: string, opts: { expiresInSeconds: number; contentType?: string }): Promise<string>;
  createUploadTarget(key: string, opts: { contentType: string; maxBytes: number; expiresInSeconds: number }): Promise<UploadTarget>;
  check(): Promise<{ ok: boolean; detail?: string }>;
}
