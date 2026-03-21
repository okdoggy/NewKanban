import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getAuthContextFromToken, listNotifications } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const db = await getMongoDb();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const auth = await getAuthContextFromToken(db, token, cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value);
  if (!auth) {
    return Response.json({ message: "Authentication required." }, { status: 401 });
  }
  const notifications = await listNotifications(db, auth);
  return Response.json({
    notifications: notifications.map((notification) => ({
      id: notification.id || notification._id,
      type: notification.type === "workspace-join-request" ? "workspace-request" : "message",
      title: notification.title,
      detail: notification.body,
      workspaceId: notification.workspaceId,
      requestId: notification.payload?.requestId,
      unread: !notification.readAt,
      createdAt: notification.createdAt,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
