import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getWorkspaceSnapshotByToken } from "@/lib/workspace-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const workspaceId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value;
  const snapshot = await getWorkspaceSnapshotByToken(sessionToken, workspaceId);

  if (!snapshot) {
    return Response.json(
      {
        authenticated: false,
        serverTime: new Date().toISOString(),
      },
      {
        status: 401,
      },
    );
  }

  return Response.json(snapshot, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
