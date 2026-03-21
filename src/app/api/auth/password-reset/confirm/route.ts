import { resetPasswordByToken } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export async function POST(request: Request) {
  const payload = (await request.json()) as { token?: string; password?: string };
  if ((payload.password ?? "").length < 8) {
    return Response.json({ message: "Password must be at least 8 characters." }, { status: 400 });
  }
  try {
    const db = await getMongoDb();
    await resetPasswordByToken(db, payload.token ?? "", payload.password ?? "");
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Unable to reset password." }, { status: 400 });
  }
}
