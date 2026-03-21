import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getAuthContextFromToken } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json()) as { workspaceId?: string };
  const cookieStore = await cookies();
  const db = await getMongoDb();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const auth = await getAuthContextFromToken(db, token, payload.workspaceId);
  if (!auth) {
    return Response.json({ message: "Workspace access denied." }, { status: 403 });
  }
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE_NAME, auth.workspaceId, { httpOnly: true, sameSite: "lax", secure: false, path: "/" });
  return Response.json({ ok: true, activeWorkspaceId: auth.workspaceId });
}
