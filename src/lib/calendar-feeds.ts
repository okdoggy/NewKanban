import type { AgendaEvent } from "@/lib/types";

const feedSources = (process.env.ICAL_FEED_URLS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function unfoldIcs(text: string) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function decodeIcsValue(value: string) {
  return value
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\n/gi, "\n");
}

function parseIcsDate(value: string) {
  const normalized = value.replace(/Z$/, "");
  if (/^\d{8}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T00:00:00`;
  }
  if (/^\d{8}T\d{6}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T${normalized.slice(9, 11)}:${normalized.slice(11, 13)}:${normalized.slice(13, 15)}`;
  }
  return value;
}

function parseEventBlock(block: string, index: number, sourceUrl: string): AgendaEvent | null {
  const fields = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) return accumulator;
      const key = line.slice(0, separatorIndex).split(";")[0].toUpperCase();
      const value = line.slice(separatorIndex + 1);
      if (!(key in accumulator)) accumulator[key] = value;
      return accumulator;
    }, {});

  if (!fields.SUMMARY || !fields.DTSTART) return null;
  const start = parseIcsDate(fields.DTSTART);
  const end = parseIcsDate(fields.DTEND ?? fields.DTSTART);

  return {
    id: `ics-${index}-${Buffer.from(sourceUrl).toString("base64url").slice(0, 8)}`,
    title: decodeIcsValue(fields.SUMMARY),
    start,
    end,
    type: "external",
    description: fields.DESCRIPTION ? decodeIcsValue(fields.DESCRIPTION) : "",
    attendees: 0,
    readonly: true,
    source: "ics",
    location: fields.LOCATION ? decodeIcsValue(fields.LOCATION) : "",
    link: fields.URL ? decodeIcsValue(fields.URL) : "",
    createdByName: "External calendar",
  };
}

async function parseFeed(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to read ICS feed: ${response.status}`);
  }
  const text = unfoldIcs(await response.text());
  const blocks = text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  return blocks
    .map((block, index) => parseEventBlock(block, index, url))
    .filter((event): event is AgendaEvent => Boolean(event))
    .sort((left, right) => left.start.localeCompare(right.start));
}

export async function readExternalCalendarFeeds() {
  if (feedSources.length === 0) return [];
  const results = await Promise.allSettled(feedSources.map((source) => parseFeed(source)));
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}
