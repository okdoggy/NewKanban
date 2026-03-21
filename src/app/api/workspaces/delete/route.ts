import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, DEFAULT_WORKSPACE_ID, SESSION_COOKIE_NAME } from "@/lib/auth";
import { deleteWorkspaceForOwner, getAuthContextFromToken, listUserWorkspaces } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json()) as { workspaceId?: string };
  const cookieStore = await cookies();
  const db = await getMongoDb();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const auth = await getAuthContextFromToken(db, token, cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value);
  if (!auth) {
    return Response.json({ message: "Authentication required." }, { status: 401 });
  }

  try {
    await deleteWorkspaceForOwner(db, auth, payload.workspaceId ?? auth.workspaceId);
    const workspaces = await listUserWorkspaces(db, auth.user._id);
    const nextWorkspaceId = workspaces[0]?.id ?? DEFAULT_WORKSPACE_ID;
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE_NAME, nextWorkspaceId, { httpOnly: true, sameSite: "lax", secure: false, path: "/" });
    return Response.json({ ok: true, nextWorkspaceId, workspaces });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Unable to delete workspace." }, { status: 400 });
  }
}
