import { NextResponse } from "next/server";
import { getProject } from "@/lib/db/projects";

/**
 * GET /api/projects/[id]/prompt — Generate AI agent integration prompt.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getProject(id);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Derive base URL respecting reverse proxy headers
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    const url = new URL(request.url);
    const baseUrl = forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : `${url.protocol}//${url.host}`;

    const webhookEndpoint = `${baseUrl}/api/webhook/${project.id}`;
    const token = project.webhook_token;

    // Auto-backup section (only if configured)
    const autoBackupEnabled = project.auto_backup_enabled === 1;
    const autoBackupSection = autoBackupEnabled
      ? `
---

## Scenario B: Scheduled Pull (Auto Backup)

Backy can also pull backups from you on a schedule. This is already configured for "${project.name}":

- **Schedule**: Every ${project.auto_backup_interval} hour${project.auto_backup_interval === 1 ? "" : "s"}
- **Your endpoint**: \`${project.auto_backup_webhook ?? "(not set)"}\`${project.auto_backup_header_key ? `\n- **Auth header**: \`${project.auto_backup_header_key}: ${project.auto_backup_header_value ? "••••••••" : "(not set)"}\`` : ""}

### How it works

1. Backy sends a \`POST\` request to your endpoint on the configured schedule.
2. Your endpoint receives the POST and should respond with \`2xx\` to acknowledge.
3. Your system then sends a backup to Backy using the **Push** method described above (POST to the webhook endpoint).

### What your endpoint needs to do

When Backy POSTs to your endpoint, implement this handler:

\`\`\`
POST ${project.auto_backup_webhook ?? "https://your-app.com/api/backup/trigger"}
Content-Type: application/json${project.auto_backup_header_key ? `\n${project.auto_backup_header_key}: ${project.auto_backup_header_value ? "••••••••" : "<your-secret>"}` : ""}
\`\`\`

Your handler should:
1. Respond immediately with \`200 OK\` (Backy has a 30-second timeout).
2. Asynchronously collect the data you want to back up.
3. Package it as a \`.json\` or \`.zip\` file.
4. POST it to Backy's webhook endpoint:

\`\`\`bash
curl -X POST ${webhookEndpoint} \\
  -H "Authorization: Bearer ${token}" \\
  -F "file=@backup.json" \\
  -F "environment=prod" \\
  -F "tag=auto-backup"
\`\`\`

### Example handler (Node.js / Express)

\`\`\`javascript
app.post("/api/backup/trigger", async (req, res) => {
  // 1. Respond immediately so Backy doesn't time out
  res.status(200).json({ status: "accepted" });

  // 2. Collect your data
  const data = await collectBackupData();

  // 3. Send backup to Backy
  const form = new FormData();
  form.append("file", new Blob([JSON.stringify(data)], { type: "application/json" }), "backup.json");
  form.append("environment", "prod");
  form.append("tag", "scheduled-backup");

  await fetch("${webhookEndpoint}", {
    method: "POST",
    headers: { "Authorization": "Bearer ${token}" },
    body: form,
  });
});
\`\`\`
`
      : `
---

## Scenario B: Scheduled Pull (Auto Backup)

Backy can also pull backups from you on a schedule. This is **not yet enabled** for "${project.name}".

To set it up, provide Backy with:
1. **A webhook URL** — an endpoint on your system that Backy will POST to on a schedule.
2. **An auth header** (optional) — a custom header name and value for authenticating the request.
3. **An interval** — how often to trigger (every 1, 12, or 24 hours).

Once enabled, Backy will POST to your endpoint on schedule. Your endpoint should:
1. Respond immediately with \`200 OK\` (Backy has a 30-second timeout).
2. Asynchronously collect the data you want to back up.
3. POST it to Backy's webhook endpoint using the Push method above.

### Example handler (Node.js / Express)

\`\`\`javascript
app.post("/api/backup/trigger", async (req, res) => {
  // 1. Respond immediately
  res.status(200).json({ status: "accepted" });

  // 2. Collect your data
  const data = await collectBackupData();

  // 3. Send to Backy
  const form = new FormData();
  form.append("file", new Blob([JSON.stringify(data)], { type: "application/json" }), "backup.json");
  form.append("environment", "prod");
  form.append("tag", "scheduled-backup");

  await fetch("${webhookEndpoint}", {
    method: "POST",
    headers: { "Authorization": "Bearer ${token}" },
    body: form,
  });
});
\`\`\`
`;

    const prompt = `## Backup Integration for "${project.name}"

You are connected to **Backy**, a backup management service. There are two ways to create backups:

| Mode | Direction | Description |
|------|-----------|-------------|
| **Push** | You → Backy | You send a backup file to Backy's webhook endpoint at any time. |
| **Pull** | Backy → You | Backy POSTs to your endpoint on a schedule; you then push a backup back.${autoBackupEnabled ? " **(Active)**" : ""} |

### Credentials

| Field | Value |
|-------|-------|
| Webhook Endpoint | \`${webhookEndpoint}\` |
| Authorization | \`Bearer ${token}\` |

All API requests require the \`Authorization: Bearer ${token}\` header unless noted otherwise.

---

## Scenario A: Push (Send Backups to Backy)

### 1. Verify API Key (HEAD)

Lightweight check to confirm your credentials before uploading:

\`\`\`
HEAD ${webhookEndpoint}
Authorization: Bearer ${token}
\`\`\`

| Status | Meaning |
|--------|---------|
| **200** | Valid — response includes \`X-Project-Name\` header |
| **401** | Missing or malformed Authorization header |
| **403** | Invalid token, project mismatch, or IP blocked |

### 2. Query Backup Status (GET)

Check how many backups exist and see the most recent ones:

\`\`\`
GET ${webhookEndpoint}
Authorization: Bearer ${token}
\`\`\`

Optional query parameter: \`?environment=prod\` to filter by environment.

Response:
\`\`\`json
{
  "project_name": "${project.name}",
  "environment": null,
  "total_backups": 42,
  "recent_backups": [
    {
      "id": "abc123",
      "tag": "daily",
      "environment": "prod",
      "file_size": 1048576,
      "is_single_json": 1,
      "created_at": "2026-02-23T10:00:00Z"
    }
  ]
}
\`\`\`

### 3. Send a Backup (POST)

Upload a backup file (\`.zip\` or \`.json\`, max 50 MB) as \`multipart/form-data\`:

\`\`\`
POST ${webhookEndpoint}
Authorization: Bearer ${token}
Content-Type: multipart/form-data
\`\`\`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`file\` | File | Yes | \`.zip\` or \`.json\` file (max 50 MB) |
| \`environment\` | String | No | One of: \`dev\`, \`prod\`, \`staging\`, \`test\` |
| \`tag\` | String | No | Descriptive label (e.g. \`"daily-backup"\`, \`"pre-migration"\`) |

Response (201):
\`\`\`json
{
  "id": "backup-id",
  "project_id": "${project.id}",
  "file_size": 1048576,
  "created_at": "2026-02-23T10:00:00Z"
}
\`\`\`

| Status | Meaning |
|--------|---------|
| **201** | Backup created successfully |
| **400** | Missing file, empty file, invalid type, or invalid environment |
| **401** | Missing or malformed Authorization header |
| **403** | Invalid token, project mismatch, or IP blocked |
| **413** | File exceeds 50 MB limit |

### 4. Restore a Backup (GET)

Retrieve a temporary download URL (valid for 15 minutes) for any backup:

\`\`\`
GET ${baseUrl}/api/restore/{backupId}
Authorization: Bearer ${token}
\`\`\`

Alternative: use a query parameter instead of the header:
\`\`\`
GET ${baseUrl}/api/restore/{backupId}?token=${token}
\`\`\`

Response:
\`\`\`json
{
  "url": "https://...",
  "backup_id": "abc123",
  "project_id": "${project.id}",
  "file_size": 1048576,
  "expires_in": 900
}
\`\`\`

Download the file from the returned \`url\` within 15 minutes.
${autoBackupSection}
---

## Quick Reference (curl)

\`\`\`bash
# Verify API key
curl -I ${webhookEndpoint} \\
  -H "Authorization: Bearer ${token}"

# Check existing backups
curl ${webhookEndpoint} \\
  -H "Authorization: Bearer ${token}"

# Send a JSON backup
curl -X POST ${webhookEndpoint} \\
  -H "Authorization: Bearer ${token}" \\
  -F "file=@backup.json" \\
  -F "environment=prod" \\
  -F "tag=daily-backup"

# Send a ZIP backup
curl -X POST ${webhookEndpoint} \\
  -H "Authorization: Bearer ${token}" \\
  -F "file=@backup.zip" \\
  -F "environment=prod" \\
  -F "tag=full-export"

# Restore a backup (replace BACKUP_ID with actual ID)
curl "${baseUrl}/api/restore/BACKUP_ID?token=${token}"
\`\`\`

## Programmatic Example (Node.js / fetch)

\`\`\`javascript
// Send a JSON backup
const data = { users: [...], settings: {...} };
const form = new FormData();
form.append("file", new Blob([JSON.stringify(data)], { type: "application/json" }), "backup.json");
form.append("environment", "prod");
form.append("tag", "daily-backup");

const res = await fetch("${webhookEndpoint}", {
  method: "POST",
  headers: { "Authorization": "Bearer ${token}" },
  body: form,
});
const backup = await res.json();
console.log("Backup created:", backup.id);

// Restore a backup
const restore = await fetch(\`${baseUrl}/api/restore/\${backup.id}\`, {
  headers: { "Authorization": "Bearer ${token}" },
});
const { url } = await restore.json();
const file = await fetch(url);
const restored = await file.json();
\`\`\`
`;

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error("Failed to generate prompt:", error);
    return NextResponse.json(
      { error: "Failed to generate prompt" },
      { status: 500 },
    );
  }
}
