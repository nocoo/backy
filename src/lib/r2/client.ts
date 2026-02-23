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
  DeleteObjectsCommand,
  ListObjectsV2Command,
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

/**
 * Delete multiple objects from R2 in batches of 1000.
 */
export async function deleteMultipleFromR2(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;

  const client = getR2Client();
  const { bucket } = getR2Config();

  let deleted = 0;
  const BATCH_SIZE = 1000;

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);

    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: batch.map((k) => ({ Key: k })),
        Quiet: true,
      },
    });

    const response = await client.send(command);
    const errors = response.Errors?.length ?? 0;
    deleted += batch.length - errors;
  }

  return deleted;
}

/** An object returned from R2 listing. */
export interface R2Object {
  key: string;
  size: number;
  lastModified: string;
}

/**
 * List all objects in R2, optionally filtered by prefix.
 * Handles pagination automatically.
 */
export async function listR2Objects(prefix?: string): Promise<R2Object[]> {
  const client = getR2Client();
  const { bucket } = getR2Config();

  const objects: R2Object[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1000,
      ContinuationToken: continuationToken,
    });

    const response = await client.send(command);

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key && obj.Size !== undefined) {
          objects.push({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified?.toISOString() ?? "",
          });
        }
      }
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return objects;
}

/** Reset the cached S3 client (for testing). */
export function resetR2Client(): void {
  _client = null;
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
