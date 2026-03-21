import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { createInvite, getAuthContextFromToken } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";
import type { MemberRole } from "@/lib/types";

export async function POST(request: Request) {
  const payload = (await request.json()) as { email?: string; role?: MemberRole };
  const db = await getMongoDb();
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const auth = await getAuthContextFromToken(db, token);
  if (!auth || !auth.permissions.manageMembers) {
    return Response.json({ message: "Owner permission required." }, { status: 403 });
  }

  try {
    const inviteLink = await createInvite(db, auth, {
      email: payload.email ?? "",
      role: payload.role ?? "viewer",
    });
    return Response.json({ ok: true, inviteLink });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Unable to create invite." }, { status: 400 });
  }
}
