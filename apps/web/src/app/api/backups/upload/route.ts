import { uploadBackupHandler } from "@backy/api/handlers/backups";
import { toResponse } from "@/lib/http";

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("Manual upload error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
  return toResponse(await uploadBackupHandler({ formData }));
}
