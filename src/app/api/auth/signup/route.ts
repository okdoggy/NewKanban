import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, DEFAULT_WORKSPACE_ID, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, normalizeHandle } from "@/lib/auth";
import { createSession, createVerificationToken, ensureDefaultOwner, getPreferredWorkspaceIdForUser, registerUser } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    name?: string;
    email?: string;
    password?: string;
    handle?: string;
  };

  const name = payload.name?.trim() ?? "";
  const email = payload.email?.trim() ?? "";
  const password = payload.password ?? "";
  const handle = payload.handle?.trim() ?? name;

  if (name.length < 2) {
    return Response.json({ message: "Name must be at least 2 characters." }, { status: 400 });
  }
  if (!email.includes("@")) {
    return Response.json({ message: "Please provide a valid email." }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ message: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    const db = await getMongoDb();
    await ensureDefaultOwner(db);
    const user = await registerUser(db, {
      name,
      email,
      password,
      handle: normalizeHandle(handle),
    });
    const verificationToken = await createVerificationToken(db, user);
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

    return Response.json({ ok: true, verificationLink: `/?verifyToken=${verificationToken}` });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unable to create account." },
      { status: 400 },
    );
  }
}
