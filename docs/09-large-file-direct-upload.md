# 09 — Large File Direct Upload (R2 Presigned PUT)

> Add a second ingest path: the Worker issues a short-lived R2 presigned
> PUT, the agent uploads bytes straight to a server-chosen object key, then
> the Worker verifies the object and inserts the backup row. The existing
> 50 MB multipart webhook/UI ingest stays unchanged.

## Background

Current ingest (`POST /api/webhook/:projectId` and `POST /api/backups/upload`)
buffers the whole file in the Worker:

- `MAX_FILE_SIZE = 50 MiB` → larger bodies return **413**
- `formData()` + `file.arrayBuffer()` + `R2.put(buffer)`
- JSON inputs are re-zipped in memory with JSZip

That is the right shape for small agent dumps. It cannot carry a ~1 GiB
archive: Cloudflare Workers request/memory limits sit around 100–128 MiB,
and two in-memory copies of 50 MiB already press the ceiling
(`docs/07-vite-web-migration-plan.md`).

R2 itself accepts objects up to 5 GiB per single `PutObject` (multipart up
to 5 TiB). Restore already uses S3 presigned **GET**. Direct-upload is the
same idea in the write direction.

## Goals

1. Agents can ingest files up to **5 GiB** without the bytes transiting the Worker.
2. Existing 50 MiB multipart ingest, restore, preview, extract, and delete keep working.
3. Object keys are **server-assigned** under a dedicated prefix; clients cannot pick or overwrite another project's objects.
4. A backup D1 row exists only after R2 `head` confirms the object.
5. Abandoned uploads are garbage-collected.

## Non-goals

- Multipart/resumable upload ( tus / S3 MPU ). 1 GiB fits in one PutObject. Add MPU later if we need >5 GiB or flaky links.
- Changing the 50 MiB cap on the old path.
- In-request JSON extract/preview of direct-upload objects (still 5 / 50 MiB on the existing extract route).
- Dashboard UI for large upload in wave 1 (webhook/agent only). Wave 2 can reuse the same handlers behind Access.

## Decision

| Topic | Choice | Why |
|---|---|---|
| Protocol | Two-phase **init → PUT R2 → complete** | D1 row only after the object exists; init can expire unused URLs |
| Transport | S3 presigned `PUT` to `https://{account}.r2.cloudflarestorage.com` | Same signer as restore; no `x-forwarded-host` in the URL |
| Max size | `1 B … 5 GiB` on the new path | R2 single-PUT limit; new path is not large-only so agents can unify |
| Min size | 1 byte | Old path stays the small-file default; no artificial >50 MiB gate |
| Key prefix | `backups/{projectId}/direct/{uploadId}{ext}` | Isolated from timestamp keys (`backups/{projectId}/{ts}{ext}`); GC by table, not R2 list |
| Auth | Same Bearer `webhook_token` as today's webhook | Agents already have it |
| Access JWT | Explicit extra public paths (not a prefix glob) | Today's matcher allows only `/api/webhook/:id` with **one** extra segment |
| Complete check | R2 binding `head(key)`: exists, `size === declared_size` | Binding, not S3, so local wrangler + e2e can plant the object without a real PUT |

## Coexistence

```
Agent
  │
  ├─ small (≤50 MiB, existing) ── POST /api/webhook/:projectId
  │                                 multipart file → Worker buffer → R2.put
  │                                 → INSERT backups
  │
  └─ any size (≤5 GiB, new) ──── POST /api/webhook/:projectId/uploads
                                  ← { upload_id, put_url, key, expires_in }
                                  PUT put_url  (bytes → R2, not Worker)
                                  POST /api/webhook/:projectId/uploads/:id/complete
                                  → head R2 → INSERT backups
```

| Surface | Old path | New path |
|---|---|---|
| Webhook POST multipart | yes, 50 MiB | no |
| Direct PUT | no | yes, 5 GiB |
| R2 key | `backups/{projectId}/{ts}{ext}` | `backups/{projectId}/direct/{uploadId}{ext}` |
| D1 `backups` row | same table, same columns | same |
| Restore / download / delete | `file_key` | `file_key` |
| Preview / extract | on ingest if previewable | **not** during complete; user can still hit extract, which keeps the 50 MiB decompressed cap |

Prompt generator and README document **both**. Existing agent snippets keep working.

## Object key contract

```
backups/{projectId}/direct/{uploadId}{ext}
```

- `{uploadId}` = nanoid, generated at init, also the `direct_uploads.id`
- `{ext}` from `getStorageExtension(fileType, fileName)` (same helper as ingest)
- Client never supplies `key`. Init response includes it only so the agent can log it.

Overwrite protection: `file_key` is unique; upload id is unique. Complete of a foreign `uploadId` 404s.

## Data model

New table `direct_uploads`. Do **not** put this `CREATE INDEX` in the main `SCHEMA_SQL` block if it references migration-only columns — follow the existing “indexes after ALTER” rule even though this is a new table (create table + its indexes together in a post-schema migration step, after the core `SCHEMA_SQL` loop).

```sql
CREATE TABLE IF NOT EXISTS direct_uploads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  declared_size INTEGER NOT NULL,
  environment TEXT,
  tag TEXT,
  sender_ip TEXT,
  status TEXT NOT NULL,          -- pending | completed | aborted | expired
  expires_at TEXT NOT NULL,
  backup_id TEXT REFERENCES backups(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_direct_uploads_project_id ON direct_uploads(project_id);
CREATE INDEX IF NOT EXISTS idx_direct_uploads_status_expires
  ON direct_uploads(status, expires_at);
```

`backups` schema unchanged. `ingest_path` is **not** added (avoid a migration we do not read). Operators can tell paths apart from `file_key` (`/direct/` vs timestamp).

## API

All three routes use the existing webhook Bearer token (and optional IP allowlist). They are **not** Cloudflare Access routes.

### 1. Init — `POST /api/webhook/:projectId/uploads`

Request JSON:

```json
{
  "file_name": "dump.tar.gz",
  "content_type": "application/gzip",
  "file_size": 1073741824,
  "environment": "prod",
  "tag": "nightly"
}
```

| Field | Rule |
|---|---|
| `file_name` | required, non-empty, basename only (reject `/` `..`) |
| `content_type` | optional, default `application/octet-stream`, then `normalizeContentType` |
| `file_size` | required integer, `1 … MAX_DIRECT_FILE_SIZE` (`5 * 1024^3`) |
| `environment` | optional, same enum as ingest (`dev/prod/staging/test`) |
| `tag` | optional string |

Responses:

| Status | When |
|---|---|
| 200 | `{ upload_id, put_url, method: "PUT", headers, file_key, expires_in, max_bytes }` |
| 401/403 | missing/invalid token or IP allowlist |
| 400 | validation |
| 404 | unknown project |
| 503 | `isS3R2Configured` false (cannot presign) |

`headers` is the exact set the client **must** send on the PUT (at least `Content-Type` if it was signed). Mismatch → R2 403 SignatureDoesNotMatch.

`expires_in`: **3600** seconds (1 GiB on a slow link; S3 max is 7 days). `expires_at = now + 3600s`.

Idempotency: each init creates a new pending row. No reuse of PUT URLs after expiry.

### 2. Bytes — `PUT {put_url}`

Issued by R2/S3, **not** our Worker. No Access, no webhook token. Authorization is the query-string signature.

Client sends the raw body, `Content-Length: file_size`, and the signed `Content-Type`.

Worker never sees this request.

### 3. Complete — `POST /api/webhook/:projectId/uploads/:uploadId/complete`

No body required. Server:

1. Load `direct_uploads` by id + project_id; 404 if missing or project mismatch.
2. 409 if `status === completed` (return existing `backup_id`).
3. 410 if `status` in `aborted|expired` or `expires_at < now`.
4. `head(file_key)` via R2 **binding**. 404 if missing.
5. If `head.size !== declared_size` → 409, leave status `pending` (client may retry PUT until expiry).
6. `createBackup(...)` with `file_size = head.size`, `json_extracted = 0`, `is_single_json = 0` unless `file_type === json` **and** `declared_size ≤ MAX_PREVIEW_SIZE` (still no extract I/O).
7. Set `status = completed`, `backup_id`, `completed_at`.
8. Return the same JSON shape as today's webhook POST success (`id`, `file_size`, `file_key`, …) so agents can share restore logic.

### 4. Abort — `DELETE /api/webhook/:projectId/uploads/:uploadId`

Optional. Sets `aborted`, deletes the R2 object if present. 409 if already completed.

## Access / public-path policy

Today `isPublicPath` allows webhook methods only when there is **exactly one** segment after `/api/webhook/`. The new routes have two or three segments, so **without an explicit allow they would require Access JWT and agents would get 401**.

Add exact-shape matchers (still no `/api/webhook/*` glob):

| Method | Path shape |
|---|---|
| POST | `/api/webhook/:projectId/uploads` |
| POST | `/api/webhook/:projectId/uploads/:uploadId/complete` |
| DELETE | `/api/webhook/:projectId/uploads/:uploadId` |

`:projectId` / `:uploadId` = one segment, no extra `/`. Pin this with Access-auth unit tests the same way the current one-segment rule is pinned.

`GET /api/restore/:id` stays as-is.

## Runtime / adapter changes

`R2Adapter` gains:

```ts
head(key): Promise<{ contentLength: number; contentType?: string } | null>
presignUpload(key, ttlSeconds, opts: { contentType: string }): Promise<string>
```

- Binding adapter: `head` → `bucket.head`; `presignUpload` delegated like `presignDownload` (S3 signer hook in `ctxMiddleware`).
- S3 adapter: `HeadObjectCommand` / `PutObjectCommand` + `getSignedUrl`.
- `ctxMiddleware` already builds a presigner when R2 keys exist; wire `presignUpload` the same way.

Init uses `presignUpload`. Complete uses `head` (binding). Delete/abort uses existing `delete`.

## Security

| Risk | Mitigation |
|---|---|
| Client-chosen key overwrites another backup | Server generates `file_key`; unique constraint |
| Host-header injection in signed URLs | Presign target is the R2 S3 endpoint, never `buildBaseUrl` / `x-forwarded-host` |
| PUT URL leak | 1 h TTL; complete still requires webhook Bearer + project match |
| Size lie (declare 1 MiB, PUT 5 GiB) | Complete compares `head.size` to `declared_size`; R2 max is still 5 GiB |
| Incomplete uploads filling the bucket | Cron GC: `pending` and `expires_at < now` → delete object, set `expired` |
| Extract bomb on 1 GiB zip | Complete does not extract; existing extract route keeps 50 MiB decompressed cap |
| Secrets in API body | Allowlist response fields; never return R2 access key |
| Access matcher too broad | Explicit path shapes + tests; no prefix glob |

IP allowlist and webhook token checks reuse the webhook helpers (do not fork).

## Garbage collection

Hourly cron (`scheduled()` already runs) adds a GC step **after** auto-backup fires:

- Select `direct_uploads` where `status = 'pending' AND expires_at < now` (limit 100 per run).
- `r2.delete(file_key)` (ignore missing).
- Set `status = 'expired'`.

Do not `SELECT *` into the API; GC is internal.

## Local / E2E

Presign needs `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY`. Binding `head`/`put`/`delete` work on local R2.

L2 strategy:

1. Init without S3 keys → **503** (already a useful contract test).
2. With keys (or a fake `presignUpload`): init → **binding put** of `declared_size` bytes to `file_key` → complete → 200 + backups row.
3. Complete with missing object → 404; size mismatch → 409; expired → 410.
4. Access tests: new paths public with token, **not** public without the extra-segment matcher (negative test that JWT is required if the matcher is removed conceptually — pin current allow).

Do not send 1 GiB through L2. Use a few kilobytes; size math is the same.

Wrangler `r2_buckets.local_dev.experimental_s3_credentials` is optional for a true HTTP PUT against miniflare S3. Not required for wave 1 e2e if we plant the object via binding.

## Implementation waves

### Wave 1 — webhook direct upload (this doc)

1. Schema `direct_uploads` + GC in `scheduled()`.
2. `R2Adapter.head` / `presignUpload` + worker `ctx` hook.
3. Handlers + webhook routes.
4. `isPublicPath` exact matchers + unit tests.
5. Prompt + README: second ingest recipe.
6. L1 tests (init validation, complete state machine, GC).
7. L2 e2e for the four routes; `gate:routes` must see them.

### Wave 2 — optional

- Dashboard “large upload” using Access session + same complete/head flow (`POST /api/backups/uploads`, **not** public).
- S3 multipart if we need >5 GiB or resume.

## Test / quality mapping

| Layer | What |
|---|---|
| L1 | `direct-uploads` handlers, adapter `head`/`presignUpload`, Access matcher, GC |
| L2 | init / complete / abort / 503-unconfigured / 409-size / 410-expired |
| L3 | not in wave 1 (no UI) |
| G1 | tsc + biome |
| gate:routes | three new webhook routes |

## Acceptance

- [ ] `POST /api/webhook/:id` multipart 50 MiB path unchanged (existing L2 still green).
- [ ] Direct init returns a PUT URL whose host is `*.r2.cloudflarestorage.com` (or miniflare S3), never `backy.hexly.ai`.
- [ ] Complete without an R2 object does not insert `backups`.
- [ ] Complete with matching `head.size` inserts one `backups` row; restore uses that `file_key`.
- [ ] Pending rows past `expires_at` are expired and the object deleted on the next cron.
- [ ] Access unit tests pin the new public path shapes and reject `/api/webhook/:id/uploads/../evil`.
- [ ] Prompt documents both ingest paths; 413 text on the old path still says 50 MB.

## Out of scope reminders

Raising `MAX_FILE_SIZE` on the buffered path is **not** an acceptable substitute. Worker memory does not allow it.
