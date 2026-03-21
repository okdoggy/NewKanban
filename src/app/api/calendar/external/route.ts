import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { getAuthContextFromToken } from "@/lib/auth-server";
import { parseConfiguredIcsFeeds, parseIcsFeed } from "@/lib/ics";
import { getMongoDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

async function readExternalAgenda() {
  const feeds = parseConfiguredIcsFeeds(process.env.ICS_FEED_URLS);
  if (feeds.length === 0) return [];

  const responses = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const response = await fetch(feed.url, { cache: "no-store" });
        if (!response.ok) return [];
        const body = await response.text();
        return parseIcsFeed(body, feed.name);
      } catch {
        return [];
      }
    }),
  );

  return responses.flat().sort((left, right) => left.start.localeCompare(right.start));
}

export async function GET() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const db = await getMongoDb();
  const auth = await getAuthContextFromToken(db, sessionToken);

  if (!auth) {
    return Response.json({ message: "Authentication required." }, { status: 401 });
  }

  return Response.json(
    { externalAgenda: await readExternalAgenda() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
