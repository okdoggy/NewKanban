import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getAuthContextFromToken, sendDirectTechMessage } from "@/lib/auth-server";
import { emitSessionRefresh } from "@/lib/realtime-bridge";
import { getMongoDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json()) as { targetUserId?: string; body?: string };
  const cookieStore = await cookies();
  const db = await getMongoDb();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const auth = await getAuthContextFromToken(db, token, cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value);
  if (!auth || !auth.permissions.comment) {
    return Response.json({ message: "Authentication required." }, { status: 401 });
  }
  try {
    await sendDirectTechMessage(db, auth, { targetUserId: payload.targetUserId ?? "", body: payload.body ?? "" });
    await emitSessionRefresh();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Unable to send message." }, { status: 400 });
  }
}
