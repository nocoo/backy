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

R2 accepts a **single PutObject** up to **5 GiB − 5 MiB**
(`5368709120` bytes). Multipart goes to 5 TiB. Restore already uses S3
presigned **GET**. Direct-upload is the same idea in the write direction.

Production D1 is **not** rebuilt by `POST /api/db/init` on deploy.
`initializeSchema` only runs locally / L2. Wave 1 therefore ships an
additive wrangler D1 migration applied `--remote` **before** the Worker
that reads `direct_uploads` is deployed. Local/e2e still create the table
via `initializeSchema`.

## Goals

1. Agents can ingest files up to **5 GiB − 5 MiB** without the bytes transiting the Worker.
2. Existing 50 MiB multipart ingest, restore, preview, extract, and delete keep working.
3. Object keys are **server-assigned** under a dedicated prefix; clients cannot pick or overwrite another project's objects.
4. A backup D1 row exists only after a **claimed** pending row and R2 `head` confirm the object.
5. Abandoned, aborted, and post-delete objects cannot be resurrected by a still-valid PUT URL.

## Non-goals

- Multipart/resumable upload (tus / S3 MPU). 1 GiB fits in one PutObject. Add MPU later if we need >5 GiB − 5 MiB or flaky links.
- Changing the 50 MiB cap on the old path.
- In-request JSON extract/preview of direct-upload objects (extract route keeps the 50 MiB decompressed cap).
- Dashboard UI for large upload in wave 1 (webhook/agent only). Wave 2 can reuse the same handlers behind Access.

## Decision

| Topic | Choice | Why |
|---|---|---|
| Protocol | Two-phase **init → PUT R2 → complete** | D1 row only after the object exists; init can expire unused URLs |
| Transport | S3 presigned `PUT` to `https://{account}.r2.cloudflarestorage.com` | Same signer as restore; no `x-forwarded-host` in the URL |
| Max size | `1 … 5 GiB − 5 MiB` (`5368709120`) | R2 single-PUT ceiling is 5 MiB short of 5 GiB |
| Min size | 1 byte | Old path stays the small-file default; no artificial >50 MiB gate |
| Key prefix | `backups/{projectId}/direct/{uploadId}.bin` or typed ext | Isolated from timestamp keys; unknown types never copy a client suffix |
| Auth | Same Bearer `webhook_token` as today's webhook | Agents already have it |
| Access JWT | Explicit extra public paths + nanoid grammar (not a prefix glob) | Today's matcher allows only `/api/webhook/:id` with **one** extra segment |
| PUT integrity | Sign `content-type`, `content-length`, and `if-none-match`; SDK `requestChecksumCalculation: "WHEN_REQUIRED"` | Stops oversized PUTs before storage; empty-body CRC32 query params break non-empty PUTs on current AWS SDK; `If-None-Match: *` makes the URL one-shot while the object exists |
| Complete check | Conditional claim on `direct_uploads`, then binding `head` | Binding `head` works locally; claim prevents double `backups` rows |
| Schema | Wrangler D1 migration `--remote` + `initializeSchema` for local | Production CD never calls `/api/db/init` |

## Coexistence

```
Agent
  │
  ├─ small (≤50 MiB, existing) ── POST /api/webhook/:projectId
  │                                 multipart file → Worker buffer → R2.put
  │                                 → INSERT backups
  │
  └─ any size (≤5 GiB − 5 MiB) ── POST /api/webhook/:projectId/uploads
                                  ← { upload_id, put_url, headers, expires_in }
                                  PUT put_url  (bytes → R2, not Worker)
                                  POST /api/webhook/:projectId/uploads/:id/complete
                                  → claim row → head R2 → INSERT backups
```

| Surface | Old path | New path |
|---|---|---|
| Webhook POST multipart | yes, 50 MiB | no |
| Direct PUT | no | yes, 5 GiB − 5 MiB |
| R2 key | `backups/{projectId}/{ts}{ext}` | `backups/{projectId}/direct/{uploadId}{ext}` |
| D1 `backups` row | same table | same table; **`file_key` UNIQUE** (new) |
| Restore / download / delete | `file_key` | `file_key` |
| Preview / extract | on ingest if previewable | complete does not extract; see JSON rule below |

Prompt generator and README document **both**. Existing agent snippets keep working.

**JSON rule on complete:** if detected type is `json` and `head.size ≤ MAX_PREVIEW_SIZE` (5 MiB), set `is_single_json = 1` and `json_key = file_key` (preview reads `json_key`; leaving it null 404s). Otherwise `is_single_json = 0`, `json_key = null`. Never run extract I/O during complete.

## Object key contract

```
backups/{projectId}/direct/{uploadId}{ext}
```

- `{uploadId}` = nanoid (same alphabet as `generateId`), also `direct_uploads.id`
- `{ext}` from `getStorageExtension` **except** `unknown` → always `.bin` (do not copy a client-controlled suffix)
- UTF-8 length of the full key ≤ **1024** (R2 limit); reject init if over
- `file_name` max 255 chars, basename only (reject `/`, `\\`, `..`, NUL)
- Client never supplies `key`

## Data model

### `direct_uploads`

Created as a **new table** in both:

1. `initializeSchema` (local / L2), after the existing `SCHEMA_SQL` loop, together with its indexes (do not splice indexes that need new columns into the historical `SCHEMA_SQL` blob).
2. A wrangler D1 migration file applied with `wrangler d1 migrations apply backy-db --remote` **before** deploying the Worker that queries the table.

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
  expires_at TEXT NOT NULL,      -- PUT TTL (now + 3600s)
  purge_after TEXT NOT NULL,     -- expires_at + 1h grace; object deleted only then
  backup_id TEXT REFERENCES backups(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_direct_uploads_project_id ON direct_uploads(project_id);
CREATE INDEX IF NOT EXISTS idx_direct_uploads_status_purge
  ON direct_uploads(status, purge_after);
```

Statuses are **tombstones**. Rows are not deleted by GC/abort. `ON DELETE CASCADE` from `projects` is the only row removal; project delete must also `r2.delete(file_key)` for that project's direct keys (same as today's backup delete).

### `backups.file_key`

Additive migration:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_backups_file_key ON backups(file_key);
```

Existing rows are unique in practice (timestamp keys). Apply locally via `initializeSchema` post-loop as well.

`ingest_path` column is **not** added. Operators distinguish paths by `file_key` (`/direct/` vs timestamp).

## Quotas (init)

Stolen or busy webhook tokens must not outrun hourly GC.

| Limit | Value | Init response |
|---|---|---|
| Pending rows per project (`status = pending`) | 20 | 429 |
| Sum of `declared_size` for pending rows per project | 20 GiB | 429 |
| Inits per project per 60s | 30 | 429 |

Count only `pending`. Completed/aborted/expired do not count.

## API

All three **Backy** routes use the existing webhook Bearer token (and optional IP allowlist). They are not Cloudflare Access routes. The R2 PUT is not a Backy route.

Webhook audit logging (`fireLog`) applies to init / complete / abort on success **and** failure, same as today's POST. Metadata allowlist: `upload_id`, `backup_id`, `file_size`, `file_name`, `environment`, `tag`, `file_type`, `error_code`. **Never** log `put_url`, query signatures, or R2 keys' credential material. `file_key` may be logged (object path, no secret).

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
| `file_name` | required, see key contract |
| `content_type` | optional, default `application/octet-stream`, then `normalizeContentType` |
| `file_size` | required integer, `1 … 5368709120` |
| `environment` | optional, same enum as ingest (`dev/prod/staging/test`) |
| `tag` | optional string |

Responses:

| Status | When |
|---|---|
| 200 | `{ upload_id, put_url, method: "PUT", headers, file_key, expires_in, max_bytes }` |
| 401/403 | missing/invalid token or IP allowlist |
| 400 | validation |
| 404 | unknown project |
| 429 | quota |
| 503 | `isS3R2Configured` false (cannot presign) |

`headers` is the **exact** set the client must send on the PUT:

| Header | Value |
|---|---|
| `Content-Type` | signed content type |
| `Content-Length` | decimal `file_size` |
| `If-None-Match` | `*` |

Mismatch → R2 403 SignatureDoesNotMatch. `If-None-Match: *` → R2 412 if the object already exists (replay / post-complete overwrite).

`expires_in`: **3600** seconds. `expires_at = now + 3600s`. `purge_after = expires_at + 3600s`.

S3 client used for `getSignedUrl` **must** set `requestChecksumCalculation: "WHEN_REQUIRED"` (and not add `x-amz-checksum-*` / `x-amz-content-sha256` for an empty-body sign). Pin with a unit test that the URL's `X-Amz-SignedHeaders` contains `content-type`, `content-length`, and `if-none-match`, and does **not** contain a checksum header that would require an empty body.

Idempotency: each init creates a new pending row. No reuse of PUT URLs after `expires_at`.

### 2. Bytes — `PUT {put_url}` (R2, not Backy)

Issued by R2/S3. No Access, no webhook token. Authorization is the query-string signature.

Worker never sees this request. `gate:routes` does not count it.

### 3. Complete — `POST /api/webhook/:projectId/uploads/:uploadId/complete`

No body required. Server:

1. Load `direct_uploads` by id + `project_id`; 404 if missing or project mismatch.
2. If `status === completed` and `backup_id` set: return **201** with that backup (idempotent).
3. If `status` in `aborted|expired` **or** `now ≥ expires_at`: **410**.
4. **Claim:** `UPDATE direct_uploads SET status = 'completing' WHERE id = ? AND status = 'pending' AND expires_at > ?`. 0 rows → re-read and follow 2/3/409. (`completing` is a short lease; if the process dies, GC treats `completing` older than 15 minutes like `pending` for retry, or expires it if past `expires_at`.)
5. `head(file_key)` via R2 **binding**. Missing → revert `pending` if still unexpired else `expired`; **404**.
6. `head.size !== declared_size` → revert `pending`; **409** (client may retry PUT until `expires_at`, but `If-None-Match: *` means they must `abort` and init again if the first PUT landed a wrong size). Prefer documenting: wrong-size PUT requires abort + new init.
7. `createBackup` with `file_size = head.size`. On `UNIQUE file_key` conflict: **409**, do not leave `completing` stuck (set `aborted` or reattach existing backup if the key already maps to this project).
8. Set `status = completed`, `backup_id`, `completed_at`.
9. Return **201** and the **same body as today's webhook POST**:

```json
{ "id": "<backup_id>", "project_id": "...", "file_size": 123, "created_at": "..." }
```

No `file_key` in the JSON body (today's webhook does not return it).

### 4. Abort — `DELETE /api/webhook/:projectId/uploads/:uploadId`

Sets `aborted`. Does **not** delete the R2 object immediately (PUT URL still valid until `expires_at`; delayed purge). **409** if `completed`. Idempotent 200 if already `aborted`.

Backup delete / project delete: delete R2 objects for those `file_key`s **and** set matching `direct_uploads` to `aborted` if still `pending`/`completing`, so a later PUT cannot recreate an object the product thinks is gone without a tombstone. Object bytes are still only purged at `purge_after` unless product-delete explicitly deletes now **and** the row is tombstoned so init cannot reuse the same key (keys contain unique upload ids, so reuse is a new key; the risk is the **old** PUT URL recreating the **old** key after delete). Product delete of a completed backup: `r2.delete(file_key)` + tombstone already `completed` with `backup_id` null. A replay PUT with `If-None-Match: *` would succeed once the object is gone — therefore product delete of a direct object **must wait until `purge_after`** or must **keep a 0-byte / delete-marker equivalent**. Practical rule: **do not `r2.delete` a direct key until `now ≥ purge_after`**, even on backup delete; hide the backup in D1 immediately. Document this on the delete handlers.

Simpler rule that still closes the hole: **never delete the R2 object until `purge_after`**. Backup/project delete only removes/nulls D1. GC is the sole deleter. Replay PUT before `purge_after` hits `If-None-Match: *` while the object still exists.

## Access / public-path policy

Today `isPublicPath` allows webhook methods only when there is **exactly one** segment after `/api/webhook/`. The new routes have two or three segments, so without an explicit allow they would require Access JWT.

Match **canonical** paths after Hono decoding, with a **nanoid** charset (`A-Za-z0-9_-`, length 21 for both ids — `generateId` is 21 chars):

| Method | Regex (anchored) |
|---|---|
| POST | `^/api/webhook/[A-Za-z0-9_-]{21}/uploads$` |
| POST | `^/api/webhook/[A-Za-z0-9_-]{21}/uploads/[A-Za-z0-9_-]{21}/complete$` |
| DELETE | `^/api/webhook/[A-Za-z0-9_-]{21}/uploads/[A-Za-z0-9_-]{21}$` |

Still no `/api/webhook/*` glob.

Negative L1 tests (raw `Request` URL, assert `c.req.path` + matcher):

- `%2F` / `%2e%2e` / `%252F` in any segment
- empty segments, double slash, trailing slash
- wrong methods (GET/PUT on these paths)
- extra segments after `complete`

`GET /api/restore/:id` stays as-is.

## Runtime / adapter changes

```ts
head(key): Promise<{ contentLength: number; contentType?: string } | null>
presignUpload(
  key,
  ttlSeconds,
  opts: { contentType: string; contentLength: number },
): Promise<string>
```

- Binding adapter: `head` → `bucket.head`; `presignUpload` via the S3 hook (same as `presignDownload`).
- S3 adapter: `PutObjectCommand` with `ContentType`, `ContentLength`, `IfNoneMatch: "*"`, then `getSignedUrl`. Client config `requestChecksumCalculation: "WHEN_REQUIRED"`.
- `ctxMiddleware` wires the hook when R2 keys exist.

Init uses `presignUpload`. Complete uses `head`. GC uses `delete` only after `purge_after`.

`scheduled()` / `ctxFromBindings` does **not** need S3 keys for GC (binding delete only).

## Security

| Risk | Mitigation |
|---|---|
| Client-chosen key | Server generates `file_key`; unique on both tables |
| Host-header injection | Presign host is R2 S3, never `buildBaseUrl` |
| PUT URL leak / replay after complete | `If-None-Match: *`; object retained until `purge_after` |
| Size lie | Signed `Content-Length` + complete `head.size` |
| Token floods D1/R2 | Per-project pending count/bytes + 30/60s init cap |
| Incomplete uploads | Tombstone rows; sole deleter is GC at `purge_after` |
| Extract bomb | Complete does not extract |
| Secrets in API/logs | Allowlisted JSON and `fireLog` metadata; no `put_url` |
| Access matcher too broad | Nanoid regex, encoded-separator tests |
| Production missing table | Remote D1 migration before deploy |

## Garbage collection

`scheduled()` already throws if auto-backup returns ≥400, which would **skip** later work and, conversely, a throw **after** auto-backup would make Cloudflare **retry the whole cron** and duplicate outbound auto-backup POSTs.

GC is a **sibling** job, not a tail hook:

```
scheduled:
  run auto-backup in try/catch (existing throw-to-retry behavior UNCHANGED for that job only)
  run direct-upload GC in its own try/catch
     — failures log + throw independently so a GC error cannot replay auto-backup
     — auto-backup failure must not skip GC (catch, then still run GC, then rethrow if auto-backup failed)
```

GC query: `status IN ('pending','completing','aborted','completed') AND purge_after < now AND` object should go (completed backups that still exist are **kept** — only delete if D1 backup row is gone or status is pending/completing/aborted/expired).

Simpler GC:

- Delete R2 object when `purge_after < now` AND `status IN ('pending','completing','aborted','expired')`.
- Then set `expired` if still `pending`/`completing`.
- **Do not** delete objects for `completed` backups.

Batch: up to 100 keys per run, ordered by `purge_after`, time-budget ~10s. Per-object `delete` failures are isolated (`Promise.allSettled`); do not abort the batch.

## Local / E2E

L2 is a **separate** `wrangler dev` process. It cannot inject a fake `presignUpload` or call `bucket.put` from the test runner except over HTTP.

Wave 1 L2:

1. Init without S3 keys → **503**.
2. Enable wrangler `r2_buckets.local_dev.experimental_s3_credentials` and point the S3 signer at the local S3 gateway (`/cdn-cgi/local/r2/s3/<bucket>`). Test: init → **real HTTP PUT** to `put_url` with the signed headers → complete → **201**.
3. Complete with missing object → 404; expired → 410; abort → 200 then complete → 410.
4. Access L1 tests as above.

If local S3 presign cannot be made to work in wrangler 4.125, fallback (documented, gated `E2E_SKIP_AUTH=true` only): `PUT /api/webhook/:id/uploads/:uploadId/plant` that `r2.put`s `declared_size` bytes. **Not** registered in production (`isPublicPath` false unless `E2E_SKIP_AUTH`). Prefer experimental S3; plant is last resort.

Do not send 1 GiB through L2.

## Implementation waves

### Wave 1 — webhook direct upload (this doc)

1. Wrangler D1 migration + `initializeSchema` for `direct_uploads` and unique `backups.file_key`.
2. `R2Adapter.head` / `presignUpload` (checksum/signed-header tests) + worker `ctx` hook.
3. Handlers + three webhook routes + `fireLog`.
4. `isPublicPath` nanoid matchers + encoded-slash tests.
5. Independent GC in `scheduled()`.
6. Prompt + README: second ingest recipe; 413 on old path still 50 MB.
7. L1 + L2 as above. `gate:routes` sees **three** new Backy routes.

### Wave 2 — optional

- Dashboard large upload behind Access (`POST /api/backups/uploads`, not public).
- S3 multipart if we need >5 GiB − 5 MiB or resume.

## Test / quality mapping

| Layer | What |
|---|---|
| L1 | handlers, adapter presign headers, Access matcher, GC isolation, quotas |
| L2 | three Backy routes: init, complete, abort (+ 503 / 409 / 410); optional real PUT against local S3 |
| L3 | not in wave 1 (no UI) |
| G1 | tsc + biome |
| gate:routes | three new webhook routes (not the external PUT) |

## Acceptance

- [ ] `POST /api/webhook/:id` multipart 50 MiB path unchanged (existing L2 still green).
- [ ] Direct init returns a PUT URL whose host is `*.r2.cloudflarestorage.com` (or miniflare S3), never `backy.hexly.ai`.
- [ ] Signed headers include `content-type`, `content-length`, `if-none-match`; no empty-body checksum query that breaks PUT.
- [ ] Complete without an R2 object does not insert `backups`.
- [ ] Complete with matching `head.size` inserts one `backups` row (**201**, webhook body shape); restore uses that `file_key`.
- [ ] Concurrent completes cannot insert two rows for one `file_key`.
- [ ] R2 object for pending/aborted is not deleted until `purge_after`; replay PUT fails while the object exists.
- [ ] Auto-backup cron failure still runs GC; GC failure does not duplicate auto-backup POSTs.
- [ ] Production migration is applied before deploy; local `initializeSchema` creates the same table.
- [ ] Access tests pin nanoid paths and reject `%2F` / trailing slash / wrong method.
- [ ] Prompt documents both ingest paths; old-path 413 still says 50 MB.

## Out of scope reminders

Raising `MAX_FILE_SIZE` on the buffered path is **not** an acceptable substitute. Worker memory does not allow it.
