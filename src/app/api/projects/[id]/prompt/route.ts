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

### Verifying Your API Key

Before sending backups, you can verify your API key is correct with a lightweight HEAD request:

\`\`\`
HEAD ${baseUrl}/api/webhook/${project.id}
Authorization: Bearer ${project.webhook_token}
\`\`\`

- **200**: API key is valid, you are ready to send backups.
- **401**: Missing or malformed Authorization header.
- **403**: Invalid API key or project mismatch.

### Sending a Backup

Send a POST request to the webhook endpoint with your backup file:

\`\`\`
POST ${baseUrl}/api/webhook/${project.id}
Authorization: Bearer ${project.webhook_token}
Content-Type: multipart/form-data

Fields:
  file: (your backup file, .zip or .json)
  environment: "dev" | "prod" (optional)
  tag: "descriptive label" (optional)
\`\`\`

### Example (curl)

\`\`\`bash
# Verify API key first
curl -I ${baseUrl}/api/webhook/${project.id} \\
  -H "Authorization: Bearer ${project.webhook_token}"

# Send a backup
curl -X POST ${baseUrl}/api/webhook/${project.id} \\
  -H "Authorization: Bearer ${project.webhook_token}" \\
  -F "file=@backup.zip" \\
  -F "environment=prod" \\
  -F "tag=daily-backup"
\`\`\`

### Restoring a Backup

When you need to restore, the Backy UI will generate a temporary download URL.
Your agent can GET that URL to download the backup file.
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
