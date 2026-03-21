import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { createVerificationToken, getAuthContextFromToken } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export async function POST() {
  const db = await getMongoDb();
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const auth = await getAuthContextFromToken(db, token);
  if (!auth) {
    return Response.json({ message: "Authentication required." }, { status: 401 });
  }

  const verificationToken = await createVerificationToken(db, auth.user);
  return Response.json({ ok: true, verificationLink: `/verify-email?token=${verificationToken}` });
}
