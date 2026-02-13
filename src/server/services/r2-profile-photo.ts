import "server-only";

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getOptionalEnv } from "@/lib/env";

const PRESIGN_PUT_TTL_SEC = 8 * 60;
const PRESIGN_GET_TTL_SEC = 5 * 60;

function getR2Config() {
  const accountId = getOptionalEnv("R2_ACCOUNT_ID");
  const accessKeyId = getOptionalEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getOptionalEnv("R2_SECRET_ACCESS_KEY");
  const bucket = getOptionalEnv("R2_BUCKET_NAME");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
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
 * Generate object key for user profile photo. Isolated prefix: users/{userId}/avatar/
 */
export function buildProfilePhotoObjectKey(userId: string, extension: string): string {
  const randomId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const ext = extension.toLowerCase() === "jpg" ? "jpeg" : extension.toLowerCase();
  return `users/${userId}/avatar/${randomId}.${ext}`;
}

export async function getPresignedPutUrlProfilePhoto(params: {
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
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: PRESIGN_PUT_TTL_SEC });
  return { uploadUrl, objectKey: params.objectKey };
}

export async function getPresignedGetUrlProfilePhoto(objectKey: string): Promise<string | null> {
  const config = getR2Config();
  const client = getClient();
  if (!config || !client) return null;
  try {
    const command = new GetObjectCommand({ Bucket: config.bucket, Key: objectKey });
    return await getSignedUrl(client, command, { expiresIn: PRESIGN_GET_TTL_SEC });
  } catch (err) {
    console.error("[r2-profile-photo] getPresignedGetUrl failed:", err);
    return null;
  }
}

export async function doesProfilePhotoExist(objectKey: string): Promise<boolean> {
  const config = getR2Config();
  const client = getClient();
  if (!config || !client) return false;
  try {
    await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteProfilePhotoObject(objectKey: string): Promise<void> {
  const config = getR2Config();
  const client = getClient();
  if (!config || !client) return;
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }));
}
