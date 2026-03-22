import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getAuthContextFromToken, listWorkspaceMembers, updateMemberRole } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";
import { emitSessionRefresh, emitWorkspaceRefresh } from "@/lib/realtime-bridge";
import type { MemberRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId") ?? "";
  const cookieStore = await cookies();
  const db = await getMongoDb();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const auth = await getAuthContextFromToken(db, token, workspaceId || cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value);

  if (!auth || auth.membership.role !== "owner") {
    return Response.json({ message: "Workspace access denied." }, { status: 403 });
  }

  const members = await listWorkspaceMembers(db, auth.workspaceId);
  return Response.json({ members }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as { workspaceId?: string; userId?: string; role?: MemberRole };
  const workspaceId = payload.workspaceId ?? "";
  const userId = payload.userId ?? "";
  const role = payload.role;

  if (!workspaceId || !userId || !role) {
    return Response.json({ message: "workspaceId, userId, and role are required." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const db = await getMongoDb();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const auth = await getAuthContextFromToken(db, token, workspaceId || cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value);

  if (!auth || auth.membership.role !== "owner") {
    return Response.json({ message: "Workspace access denied." }, { status: 403 });
  }

  if (userId === auth.user._id) {
    return Response.json({ message: "Owners cannot change their own role here." }, { status: 400 });
  }

  await updateMemberRole(db, auth.workspaceId, userId, role);
  await emitWorkspaceRefresh(auth.workspaceId);
  await emitSessionRefresh();
  const members = await listWorkspaceMembers(db, auth.workspaceId);
  return Response.json({ ok: true, members }, { headers: { "Cache-Control": "no-store" } });
}
