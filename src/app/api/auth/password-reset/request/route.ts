import { createPasswordResetToken } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export async function POST(request: Request) {
  const payload = (await request.json()) as { email?: string };
  const db = await getMongoDb();
  const token = await createPasswordResetToken(db, payload.email ?? "");
  return Response.json({ ok: true, resetLink: token ? `/?resetToken=${token}` : null });
}
