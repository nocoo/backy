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

    const prompt = `## Backup Integration for "${project.name}"

You are connected to Backy, a backup management service. Use the endpoints below to verify connectivity, send backups, check backup status, and restore previous backups.

**Base URL**: ${baseUrl}
**Webhook Endpoint**: ${baseUrl}/api/webhook/${project.id}
**Authorization**: \`Bearer ${project.webhook_token}\`

---

### 1. Verify API Key (HEAD)

Before sending backups, verify your API key is correct with a lightweight HEAD request:

\`\`\`
HEAD ${baseUrl}/api/webhook/${project.id}
Authorization: Bearer ${project.webhook_token}
\`\`\`

- **200**: API key is valid, response includes \`X-Project-Name\` header.
- **401**: Missing or malformed Authorization header.
- **403**: Invalid API key or project mismatch.

### 2. Query Backup Status (GET)

Check how many backups exist and see the most recent ones:

\`\`\`
GET ${baseUrl}/api/webhook/${project.id}
Authorization: Bearer ${project.webhook_token}
\`\`\`

Optional query parameter: \`?environment=prod\` to filter by environment.

Response:
\`\`\`json
{
  "project_name": "${project.name}",
  "environment": null,
  "total_backups": 42,
  "recent_backups": [
    { "id": "abc123", "tag": "daily", "environment": "prod", "file_size": 1048576, "created_at": "2026-02-23T10:00:00Z" }
  ]
}
\`\`\`

### 3. Send a Backup (POST)

Upload a backup file (.zip or .json, max 50MB):

\`\`\`
POST ${baseUrl}/api/webhook/${project.id}
Authorization: Bearer ${project.webhook_token}
Content-Type: multipart/form-data

Fields:
  file: (your backup file, .zip or .json, required)
  environment: "dev" | "prod" | "staging" | "test" (optional)
  tag: "descriptive label" (optional)
\`\`\`

Response (201):
\`\`\`json
{ "id": "backup-id", "project_id": "${project.id}", "file_size": 1048576, "created_at": "..." }
\`\`\`

### 4. Restore a Backup (GET)

Retrieve a temporary download URL (valid for 15 minutes) for any backup:

\`\`\`
GET ${baseUrl}/api/restore/{backupId}
Authorization: Bearer ${project.webhook_token}
\`\`\`

Or use a query parameter: \`GET ${baseUrl}/api/restore/{backupId}?token=${project.webhook_token}\`

Response:
\`\`\`json
{ "url": "https://...", "backup_id": "...", "file_size": 1048576, "expires_in": 900 }
\`\`\`

Download the file from the returned \`url\`.

### Example Workflow (curl)

\`\`\`bash
# 1. Verify API key
curl -I ${baseUrl}/api/webhook/${project.id} \\
  -H "Authorization: Bearer ${project.webhook_token}"

# 2. Check existing backups
curl ${baseUrl}/api/webhook/${project.id} \\
  -H "Authorization: Bearer ${project.webhook_token}"

# 3. Send a backup
curl -X POST ${baseUrl}/api/webhook/${project.id} \\
  -H "Authorization: Bearer ${project.webhook_token}" \\
  -F "file=@backup.json" \\
  -F "environment=prod" \\
  -F "tag=daily-backup"

# 4. Restore a backup (replace {backupId} with actual ID from step 2 or 3)
curl "${baseUrl}/api/restore/{backupId}?token=${project.webhook_token}"
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
