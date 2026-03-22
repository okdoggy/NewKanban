import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, DEFAULT_WORKSPACE_ID, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, normalizeHandle } from "@/lib/auth";
import { authenticateUser, buildDisplayNameFromIdentifier, createMfaChallenge, createSession, ensureDefaultOwner, consumeMfaChallenge, findUserByIdentifier, getPreferredWorkspaceIdForUser, registerUser } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    accountId?: string;
    email?: string;
    password?: string;
    otp?: string;
    challengeToken?: string;
  };

  try {
    const db = await getMongoDb();
    await ensureDefaultOwner(db);

    let user;
    let autoRegistered = false;
    const accountId = (payload.accountId ?? payload.email ?? "").trim().toLowerCase();
    if (!accountId) {
      return Response.json({ message: "Knox ID is required." }, { status: 400 });
    }
    if (payload.challengeToken && payload.otp) {
      user = await consumeMfaChallenge(db, payload.challengeToken, payload.otp);
    } else {
      const existingUser = await findUserByIdentifier(db, accountId);
      if (!existingUser) {
        if ((payload.password ?? "").length < 4) {
          return Response.json({ message: "Password must be at least 4 characters." }, { status: 400 });
        }
        user = await registerUser(db, {
          name: buildDisplayNameFromIdentifier(accountId),
          email: accountId,
          password: payload.password ?? "",
          handle: normalizeHandle(accountId),
          role: "owner",
          emailVerified: true,
        });
        autoRegistered = true;
      } else {
        user = await authenticateUser(db, accountId, payload.password ?? "");
      }
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

    return Response.json({
      ok: true,
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
      autoRegistered,
      message: autoRegistered ? `${accountId} 계정이 자동으로 생성되었습니다.` : undefined,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Unable to sign in." },
      { status: 401 },
    );
  }
}
