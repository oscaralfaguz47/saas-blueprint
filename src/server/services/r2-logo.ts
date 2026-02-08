import "server-only";

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getOptionalEnv } from "@/lib/env";

const PRESIGN_TTL_SEC = 8 * 60; // 8 minutes

function getR2Config() {
  const accountId = getOptionalEnv("R2_ACCOUNT_ID");
  const accessKeyId = getOptionalEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getOptionalEnv("R2_SECRET_ACCESS_KEY");
  const bucket = getOptionalEnv("R2_BUCKET_NAME");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket)
    return null;
  return {
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    bucket,
  };
}

export function isR2Configured(): boolean {
  return getR2Config() !== null;
}

function getClient(): S3Client | null {
  const config = getR2Config();
  if (!config) return null;
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: config.credentials,
  });
}

/**
 * Generate a presigned PUT URL for direct client upload.
 * Object key must follow: tenants/{tenantId}/logo/{randomId}.{ext}
 */
export async function getPresignedPutUrl(params: {
  objectKey: string;
  contentType: string;
}): Promise<{ uploadUrl: string; objectKey: string } | null> {
  const config = getR2Config();
  const client = getClient();
  if (!config || !client) return null;

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: params.objectKey,
    ContentType: params.contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: PRESIGN_TTL_SEC });
  return { uploadUrl, objectKey: params.objectKey };
}

const PRESIGN_GET_TTL_SEC = 5 * 60; // 5 minutes for viewing

/**
 * Generate a presigned GET URL to display a logo (private bucket).
 * Returns null if R2 is not configured or if signing fails (e.g. SDK/credentials error).
 */
export async function getPresignedGetUrl(objectKey: string): Promise<string | null> {
  const config = getR2Config();
  const client = getClient();
  if (!config || !client) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    });
    return await getSignedUrl(client, command, { expiresIn: PRESIGN_GET_TTL_SEC });
  } catch (err) {
    console.error("[r2-logo] getPresignedGetUrl failed:", err);
    return null;
  }
}

/**
 * Delete a logo object from R2 (e.g. when replacing with a new logo).
 * Ignores 404; throws on other errors.
 */
export async function deleteLogoObject(objectKey: string): Promise<void> {
  const config = getR2Config();
  const client = getClient();
  if (!config || !client) return;

  await client.send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey })
  );
}

/**
 * Verify that an object exists in R2 (for confirm step).
 */
export async function doesObjectExist(objectKey: string): Promise<boolean> {
  const config = getR2Config();
  const client = getClient();
  if (!config || !client) return false;

  try {
    await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a secure object key for tenant logo.
 * Format: tenants/{tenantId}/logo/{randomId}.{ext}
 */
export function buildLogoObjectKey(tenantId: string, extension: string): string {
  const randomId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const ext = extension.toLowerCase() === "jpg" ? "jpeg" : extension.toLowerCase();
  return `tenants/${tenantId}/logo/${randomId}.${ext}`;
}
