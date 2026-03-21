import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, DEFAULT_WORKSPACE_ID, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { authenticateUser, createMfaChallenge, createSession, ensureDefaultOwner, consumeMfaChallenge, getPreferredWorkspaceIdForUser } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    email?: string;
    password?: string;
    otp?: string;
    challengeToken?: string;
  };

  try {
    const db = await getMongoDb();
    await ensureDefaultOwner(db);

    let user;
    if (payload.challengeToken && payload.otp) {
      user = await consumeMfaChallenge(db, payload.challengeToken, payload.otp);
    } else {
      user = await authenticateUser(db, payload.email ?? "", payload.password ?? "");
      if (user.mfaEnabled) {
        const challengeToken = await createMfaChallenge(db, user);
        return Response.json({ ok: false, mfaRequired: true, challengeToken }, { status: 409 });
      }
    }

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

    return Response.json({ ok: true, emailVerified: user.emailVerified, mfaEnabled: user.mfaEnabled });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unable to sign in." },
      { status: 401 },
    );
  }
}
