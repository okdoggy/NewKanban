import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth";
import { createWorkspaceJoinRequest, getAuthContextFromToken } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json()) as { workspaceKey?: string; message?: string };
  const cookieStore = await cookies();
  const db = await getMongoDb();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const auth = await getAuthContextFromToken(db, token, cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value);
  if (!auth) {
    return Response.json({ message: "Authentication required." }, { status: 401 });
  }

  const workspaceKey = (payload.workspaceKey ?? "").trim().toUpperCase();
  const workspace = await db.collection<{ _id: string }>("workspace_records").findOne({ workspaceKey });
  if (!workspace) {
    return Response.json({ message: "Workspace key not found." }, { status: 404 });
  }

  try {
    await createWorkspaceJoinRequest(db, auth, { workspaceId: workspace._id, message: payload.message });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Unable to request access." }, { status: 400 });
  }
}
