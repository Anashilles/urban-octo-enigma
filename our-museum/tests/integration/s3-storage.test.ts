import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { beforeAll, describe, expect, it } from "vitest";
import { S3StorageDriver } from "@/services/storage/s3-driver";

/**
 * Exercises the S3 driver against a real S3-compatible API (MinIO, moto,
 * R2…). Opt-in: set S3_TEST_ENDPOINT (and optionally S3_TEST_ACCESS_KEY_ID /
 * S3_TEST_SECRET_ACCESS_KEY). The bucket is created if needed.
 */
const endpoint = process.env.S3_TEST_ENDPOINT;
const config = {
  endpoint,
  region: "us-east-1",
  bucket: `om-test-${Date.now().toString(36)}`,
  accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? "test",
  secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? "test",
  forcePathStyle: true,
};

describe.skipIf(!endpoint)("S3 storage driver", () => {
  const driver = new S3StorageDriver(config);

  beforeAll(async () => {
    const client = new S3Client({ endpoint, region: config.region, forcePathStyle: true, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
    await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
  });

  it("reports a healthy bucket", async () => {
    expect(await driver.check()).toMatchObject({ ok: true });
  });

  it("stores, reads, signs and deletes objects", async () => {
    const key = "museums/m1/photos/p1/large.webp";
    await driver.put(key, Buffer.from("hello museum"), "image/webp");
    expect((await driver.get(key)).toString()).toBe("hello museum");
    expect(await driver.head(key)).toMatchObject({ size: 12 });

    const signed = await driver.signedGetUrl(key, { expiresInSeconds: 60 });
    const res = await fetch(signed);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello museum");

    // Unsigned access must fail: the bucket is private.
    const unsigned = new URL(signed);
    unsigned.search = "";
    expect((await fetch(unsigned)).ok).toBe(false);

    await driver.delete(key);
    expect(await driver.head(key)).toBeNull();
  });

  it("accepts a direct browser-style upload through the presigned PUT", async () => {
    const key = "incoming/u1/upload.jpg";
    const target = await driver.createUploadTarget(key, { contentType: "image/jpeg", maxBytes: 1000, expiresInSeconds: 60 });
    const put = await fetch(target.url, { method: target.method, headers: target.headers, body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
    expect(put.ok).toBe(true);
    expect(await driver.head(key)).toMatchObject({ size: 4 });
    await driver.delete(key);
  });
});
