export function parseDate(value: string) {
  return value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
}

export function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  next.setDate(next.getDate() - day);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfWeek(date: Date) {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 6);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function addHours(date: Date, amount: number) {
  const next = new Date(date);
  next.setHours(next.getHours() + amount);
  return next;
}

export function addMinutes(date: Date, amount: number) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + amount);
  return next;
}

export function addMonths(date: Date, amount: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

export function isSameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

export function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

export function isWithinRange(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

export function formatDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", options).format(date);
}

export function formatDateFromValue(value: string, options: Intl.DateTimeFormatOptions) {
  return formatDate(parseDate(value), options);
}

export function formatDateTimeLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function buildMonthGrid(currentMonth: Date) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const days = [] as Date[];

  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    days.push(new Date(cursor));
  }

  return days;
}

export function differenceInDays(start: Date, end: Date) {
  const msInDay = 1000 * 60 * 60 * 24;
  return Math.round((end.getTime() - start.getTime()) / msInDay);
}

export function differenceInMinutes(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

export function relativeTime(value: string) {
  const date = parseDate(value);
  const diff = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(days, "day");
}
