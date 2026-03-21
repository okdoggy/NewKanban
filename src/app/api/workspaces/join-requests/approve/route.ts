import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth";
import { approveJoinRequest, getAuthContextFromToken } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json()) as { requestId?: string; approved?: boolean };
  const cookieStore = await cookies();
  const db = await getMongoDb();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const auth = await getAuthContextFromToken(db, token, cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value);
  if (!auth || auth.membership.role !== "owner") {
    return Response.json({ message: "Owner permission required." }, { status: 403 });
  }

  try {
    await approveJoinRequest(db, auth, { requestId: payload.requestId ?? "", approved: payload.approved !== false });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Unable to review join request." }, { status: 400 });
  }
}
