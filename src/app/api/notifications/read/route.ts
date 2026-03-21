import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getAuthContextFromToken, markNotificationRead } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json()) as { notificationId?: string };
  const cookieStore = await cookies();
  const db = await getMongoDb();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const auth = await getAuthContextFromToken(db, token, cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value);
  if (!auth) {
    return Response.json({ message: "Authentication required." }, { status: 401 });
  }
  await markNotificationRead(db, auth, payload.notificationId ?? "");
  return Response.json({ ok: true });
}
