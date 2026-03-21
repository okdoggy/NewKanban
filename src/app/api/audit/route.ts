import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { getAuthContextFromToken, listAuditLogs } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getMongoDb();
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const auth = await getAuthContextFromToken(db, token);
  if (!auth) {
    return Response.json({ message: "Authentication required." }, { status: 401 });
  }

  const auditLogs = await listAuditLogs(db, auth);
  return Response.json({ auditLogs });
}
