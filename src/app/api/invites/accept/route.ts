import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, DEFAULT_WORKSPACE_ID, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { acceptInvite, createSession, getPreferredWorkspaceIdForUser } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export async function POST(request: Request) {
  const payload = (await request.json()) as { token?: string; name?: string; handle?: string; password?: string };
  if ((payload.password ?? "").length < 8) {
    return Response.json({ message: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    const db = await getMongoDb();
    const user = await acceptInvite(db, {
      token: payload.token ?? "",
      name: payload.name ?? "",
      handle: payload.handle ?? "",
      password: payload.password ?? "",
    });
    const workspaceId = await getPreferredWorkspaceIdForUser(db, user._id);
    const session = await createSession(db, user._id, workspaceId);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
      expires: session.expiresAt,
    });
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE_NAME, workspaceId || DEFAULT_WORKSPACE_ID, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
      expires: session.expiresAt,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Unable to accept invite." }, { status: 400 });
  }
}
