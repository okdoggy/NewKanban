import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { getAuthContextFromToken } from "@/lib/auth-server";
import { readExternalCalendarFeeds } from "@/lib/calendar-feeds";
import { getMongoDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const db = await getMongoDb();
  const auth = await getAuthContextFromToken(db, sessionToken);
  if (!auth) {
    return Response.json({ message: "Authentication required." }, { status: 401 });
  }

  const events = await readExternalCalendarFeeds();
  return Response.json(
    {
      events,
      serverTime: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
