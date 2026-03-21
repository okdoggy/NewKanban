import { verifyEmailByToken } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export async function POST(request: Request) {
  const payload = (await request.json()) as { token?: string };
  try {
    const db = await getMongoDb();
    await verifyEmailByToken(db, payload.token ?? "");
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Unable to verify email." }, { status: 400 });
  }
}
