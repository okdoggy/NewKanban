import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth";
import { destroySession } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const db = await getMongoDb();
  await destroySession(db, token);
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE_NAME);

  return Response.json({ ok: true });
}
