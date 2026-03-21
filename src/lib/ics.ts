import { addDays, formatDateTimeLocal, parseDate } from "@/lib/date-utils";
import type { AgendaEvent } from "@/lib/types";

function unfoldIcs(source: string) {
  return source.replace(/\r\n[ \t]/g, "");
}

function parseIcsDate(value: string) {
  if (!value) return null;
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    const hour = Number(value.slice(9, 11));
    const minute = Number(value.slice(11, 13));
    const second = Number(value.slice(13, 15));
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }
  if (/^\d{8}T\d{6}$/.test(value)) {
    return parseDate(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}`);
  }
  if (/^\d{8}$/.test(value)) {
    return parseDate(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`);
  }
  return new Date(value);
}

function parseRrule(rule: string | undefined, start: Date) {
  if (!rule) return [] as Date[];
  const freqMatch = rule.match(/FREQ=([A-Z]+)/);
  const countMatch = rule.match(/COUNT=(\d+)/);
  const untilMatch = rule.match(/UNTIL=([^;]+)/);
  const freq = freqMatch?.[1];
  const count = Math.min(Number(countMatch?.[1] ?? 0) || 5, 12);
  const until = untilMatch ? parseIcsDate(untilMatch[1]) : null;
  const occurrences: Date[] = [];
  let cursor = new Date(start);
  for (let index = 0; index < count - 1; index += 1) {
    if (freq === "DAILY") cursor = addDays(cursor, 1);
    else if (freq === "WEEKLY") cursor = addDays(cursor, 7);
    else if (freq === "MONTHLY") cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate(), cursor.getHours(), cursor.getMinutes(), cursor.getSeconds());
    else break;
    if (until && cursor > until) break;
    occurrences.push(new Date(cursor));
  }
  return occurrences;
}

export function parseIcsFeed(source: string, calendarName = "External calendar") {
  const lines = unfoldIcs(source).split(/\r?\n/);
  const events: AgendaEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT" && current) {
      const start = parseIcsDate(current.DTSTART);
      const end = parseIcsDate(current.DTEND) ?? (start ? addDays(start, 1) : null);
      if (start && end && current.SUMMARY) {
        const baseId = current.UID || `${calendarName}-${current.SUMMARY}-${start.toISOString()}`;
        const baseEvent: AgendaEvent = {
          id: `external-${baseId}`,
          title: current.SUMMARY,
          start: start.toISOString(),
          end: end.toISOString(),
          type: "external",
          description: current.DESCRIPTION || "",
          attendees: 0,
          location: current.LOCATION || "",
          link: current.URL || "",
          recurrence: current.RRULE || null,
          source: "external",
          readonly: true,
          externalCalendarName: calendarName,
        };
        events.push(baseEvent);
        for (const occurrenceStart of parseRrule(current.RRULE, start)) {
          const durationMs = end.getTime() - start.getTime();
          const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
          events.push({
            ...baseEvent,
            id: `${baseEvent.id}-${formatDateTimeLocal(occurrenceStart)}`,
            start: occurrenceStart.toISOString(),
            end: occurrenceEnd.toISOString(),
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const delimiterIndex = line.indexOf(":");
    if (delimiterIndex == -1) continue;
    const rawKey = line.slice(0, delimiterIndex);
    const value = line.slice(delimiterIndex + 1);
    const key = rawKey.split(";")[0];
    current[key] = value.replace(/\\n/g, "\n");
  }

  return events;
}

export function parseConfiguredIcsFeeds(value: string | undefined) {
  if (!value?.trim()) return [] as Array<{ name: string; url: string }>;
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const [name, url] = entry.includes("|") ? entry.split("|") : [`Feed ${index + 1}`, entry];
      return { name: name.trim(), url: url.trim() };
    })
    .filter((entry) => entry.url);
}
