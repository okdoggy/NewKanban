import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { disableMfa, getAuthContextFromToken } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export async function POST(request: Request) {
  const payload = (await request.json()) as { code?: string };
  const db = await getMongoDb();
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const auth = await getAuthContextFromToken(db, token);
  if (!auth) {
    return Response.json({ message: "Authentication required." }, { status: 401 });
  }

  try {
    await disableMfa(db, auth, payload.code ?? "");
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Unable to disable MFA." }, { status: 400 });
  }
}
