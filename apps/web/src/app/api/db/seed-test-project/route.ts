import { seedTestProjectHandler } from "@backy/api/handlers/db";
import { toResponse } from "@/lib/http";

export async function POST() {
  return toResponse(await seedTestProjectHandler());
}
