/**
 * S3-compatible R2 adapter — Cloudflare R2 via the AWS S3 SDK.
 *
 * Used by the legacy Next.js host. The Worker host will provide a
 * separate adapter built on the R2 binding.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { BackyEnv, R2Adapter, R2GetResult } from "../../runtime";

type R2EnvKeys =
  | "R2_ACCESS_KEY_ID"
  | "R2_SECRET_ACCESS_KEY"
  | "R2_ACCOUNT_ID"
  | "R2_BUCKET_NAME";

function readConfig(env: Pick<BackyEnv, R2EnvKeys>) {
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const accountId = env.R2_ACCOUNT_ID;
  const bucket = env.R2_BUCKET_NAME;

  if (!accessKeyId || !secretAccessKey || !accountId || !bucket) {
    throw new Error(
      "Missing R2 configuration. Required: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME",
    );
  }
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  return { accessKeyId, secretAccessKey, endpoint, bucket };
}

interface SdkBody {
  transformToByteArray?: () => Promise<Uint8Array>;
}

export function createS3R2Adapter(env: Pick<BackyEnv, R2EnvKeys>): R2Adapter {
  let _client: S3Client | null = null;
  function client(): S3Client {
    if (_client) return _client;
    const cfg = readConfig(env);
    _client = new S3Client({
      region: "auto",
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
    return _client;
  }

  return {
    async put(key, body, opts) {
      const { bucket } = readConfig(env);
      // S3 PutObjectCommand expects Buffer | Uint8Array | Blob | ReadableStream;
      // ArrayBuffer is normalised to Uint8Array.
      const normalised: Uint8Array | Buffer | ReadableStream =
        body instanceof ArrayBuffer ? new Uint8Array(body) : body;
      await client().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: normalised,
          ContentType: opts?.contentType,
        }),
      );
    },
    async get(key) {
      const { bucket } = readConfig(env);
      const response = await client().send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const sdkBody = response.Body as SdkBody | undefined;
      const result: R2GetResult = {
        body: (response.Body as ReadableStream<Uint8Array> | null) ?? null,
        bytes: async () => {
          if (sdkBody?.transformToByteArray) {
            return sdkBody.transformToByteArray();
          }
          throw new Error("R2 body does not expose transformToByteArray");
        },
        ...(response.ContentType !== undefined && {
          contentType: response.ContentType,
        }),
        ...(response.ContentLength !== undefined && {
          contentLength: response.ContentLength,
        }),
      };
      return result;
    },
    async delete(key) {
      const { bucket } = readConfig(env);
      await client().send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
    },
    async presignDownload(key, ttlSeconds) {
      const { bucket } = readConfig(env);
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(client(), command, { expiresIn: ttlSeconds });
    },
    async ping() {
      const { bucket } = readConfig(env);
      await client().send(new HeadBucketCommand({ Bucket: bucket }));
    },
  };
}

/** Check if R2 S3 credentials are present in the supplied env. */
export function isS3R2Configured(env: BackyEnv): boolean {
  return !!(
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_ACCOUNT_ID &&
    env.R2_BUCKET_NAME
  );
}
