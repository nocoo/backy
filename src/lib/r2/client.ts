/**
 * Cloudflare R2 client — S3-compatible API for backup file storage.
 *
 * Environment variables required:
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Presigned URL expiration in seconds (15 minutes for restore downloads). */
const PRESIGN_EXPIRES_IN = 900;

function getR2Config() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!accessKeyId || !secretAccessKey || !accountId || !bucket) {
    throw new Error(
      "Missing R2 configuration. Required: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME",
    );
  }

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

  return { accessKeyId, secretAccessKey, endpoint, bucket };
}

let _client: S3Client | null = null;

function getR2Client(): S3Client {
  if (_client) return _client;

  const { accessKeyId, secretAccessKey, endpoint } = getR2Config();

  _client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  return _client;
}

/**
 * Upload a buffer to R2.
 */
export async function uploadToR2(
  key: string,
  body: Uint8Array | Buffer,
  contentType: string,
): Promise<void> {
  const client = getR2Client();
  const { bucket } = getR2Config();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/**
 * Download an object from R2 as a readable stream.
 */
export async function downloadFromR2(key: string) {
  const client = getR2Client();
  const { bucket } = getR2Config();

  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  return {
    body: response.Body,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
  };
}

/**
 * Generate a presigned GET URL for temporary download access.
 */
export async function createPresignedDownloadUrl(
  key: string,
): Promise<string> {
  const client = getR2Client();
  const { bucket } = getR2Config();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn: PRESIGN_EXPIRES_IN });
}

/**
 * Delete an object from R2.
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client();
  const { bucket } = getR2Config();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

/** Check if R2 environment variables are configured. */
export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_BUCKET_NAME
  );
}

/** Lightweight R2 connectivity check via HeadBucket. */
export async function pingR2(): Promise<void> {
  const client = getR2Client();
  const { bucket } = getR2Config();
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
}
