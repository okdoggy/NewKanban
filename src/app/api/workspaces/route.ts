import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth";
import { createWorkspaceForUser, getAuthContextFromToken, listPendingJoinRequests, listUserWorkspaces } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";
import { emitSessionRefresh } from "@/lib/realtime-bridge";
import { ensureWorkspaceDocument } from "@/lib/workspace-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const db = await getMongoDb();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const auth = await getAuthContextFromToken(db, token, cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value);
  if (!auth) {
    return Response.json({ message: "Authentication required." }, { status: 401 });
  }

  const [memberships, requests] = await Promise.all([
    listUserWorkspaces(db, auth.user._id),
    auth.membership.role === "owner" ? listPendingJoinRequests(db, auth.workspaceId) : Promise.resolve([]),
  ]);
  const catalog = await Promise.all(
    memberships
      .map(async (workspace) => {
        const [memberCount, pendingRequestCount] = await Promise.all([
          db.collection("memberships").countDocuments({ workspaceId: workspace.id }),
          db.collection("workspace_join_requests").countDocuments({ workspaceId: workspace.id, status: "pending" }),
        ]);
        return {
          id: workspace.id,
          name: workspace.name,
          workspaceKey: workspace.workspaceKey,
          role: workspace.role,
          memberCount,
          pendingRequestCount,
          joinRequested: workspace.pendingRequest,
          isActive: workspace.id === auth.workspaceId,
        };
      }),
  );

  const currentWorkspaceIncluded = catalog.some((workspace) => workspace.id === auth.workspaceId);
  if (!currentWorkspaceIncluded) {
    const currentWorkspace = await ensureWorkspaceDocument(db, auth.workspaceId);
    catalog.unshift({
      id: currentWorkspace.id,
      name: currentWorkspace.name,
      workspaceKey: currentWorkspace.workspaceKey,
      role: auth.membership.role,
      memberCount: await db.collection("memberships").countDocuments({ workspaceId: currentWorkspace.id }),
      pendingRequestCount: await db.collection("workspace_join_requests").countDocuments({ workspaceId: currentWorkspace.id, status: "pending" }),
      joinRequested: false,
      isActive: true,
    });
  }

  const workspaces = catalog.filter((workspace) => Boolean(workspace.role));
  const discoverableWorkspaces = catalog.filter((workspace) => !workspace.role);

  return Response.json({ workspaces, discoverableWorkspaces, requests, activeWorkspaceId: auth.workspaceId }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const db = await getMongoDb();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const auth = await getAuthContextFromToken(db, token, cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value);
  if (!auth) {
    return Response.json({ message: "Authentication required." }, { status: 401 });
  }

  const payload = (await request.json()) as { name?: string; description?: string };
  try {
    const workspace = await createWorkspaceForUser(db, auth, payload);
    await ensureWorkspaceDocument(db, workspace.id);
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE_NAME, workspace.id, { httpOnly: true, sameSite: "lax", secure: false, path: "/" });
    await emitSessionRefresh();
    return Response.json({ ok: true, workspace, workspaces: await listUserWorkspaces(db, auth.user._id) });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Unable to create workspace." }, { status: 400 });
  }
}
