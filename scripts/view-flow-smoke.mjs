const BASE_URL = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const OWNER_EMAIL = process.env.DEMO_OWNER_EMAIL ?? "owner@newkanban.local";
const OWNER_PASSWORD = process.env.DEMO_OWNER_PASSWORD ?? "Admin123!";

function jarToCookie(jar) {
  return Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function mergeCookies(headers, jar) {
  const setCookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  for (const cookie of setCookies) {
    const [pair] = cookie.split(";");
    const eqIndex = pair.indexOf("=");
    if (eqIndex > -1) jar[pair.slice(0, eqIndex)] = pair.slice(eqIndex + 1);
  }
}

async function request(url, options = {}, jar = null) {
  const headers = new Headers(options.headers || {});
  if (jar && Object.keys(jar).length) headers.set("cookie", jarToCookie(jar));
  const response = await fetch(url, { ...options, headers });
  if (jar) mergeCookies(response.headers, jar);
  return response;
}

async function waitForReady() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fetch(`${BASE_URL}/api/bootstrap`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const jar = {};

await waitForReady();

const loginResponse = await request(`${BASE_URL}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
}, jar);
assert(loginResponse.ok, `Owner login failed with status ${loginResponse.status}`);

const bootstrapResponse = await request(`${BASE_URL}/api/bootstrap`, {}, jar);
assert(bootstrapResponse.ok, `Bootstrap failed with status ${bootstrapResponse.status}`);
const payload = await bootstrapResponse.json();

assert(payload.authenticated === true, "Expected authenticated bootstrap payload");
assert(Array.isArray(payload.workspace?.tasks), "Expected task array for Kanban/Gantt");
assert(Array.isArray(payload.workspace?.agenda), "Expected agenda array for Overview/Calendar");
assert(Array.isArray(payload.workspace?.notes), "Expected note array for Whiteboard");
assert(payload.workspace.tasks.length > 0, "Expected at least one task for Overview/Kanban/Gantt");
assert(payload.workspace.agenda.length > 0, "Expected at least one event for Overview/Calendar");
assert(payload.workspace.notes.length > 0, "Expected at least one note for Whiteboard");
assert(payload.workspace.tasks.some((task) => ["todo", "progress", "review", "done"].includes(task.status)), "Expected valid task statuses");
assert(payload.workspace.tasks.some((task) => task.startDate && task.dueDate), "Expected tasks with timeline dates");
assert(payload.workspace.agenda.some((event) => event.start && event.end), "Expected events with date range");
assert(payload.workspace.notes.some((note) => typeof note.x === "number" && typeof note.y === "number"), "Expected whiteboard note coordinates");

console.log("qa:views passed");
console.log(JSON.stringify({
  tasks: payload.workspace.tasks.length,
  events: payload.workspace.agenda.length,
  notes: payload.workspace.notes.length,
  members: payload.members?.length ?? 0,
}, null, 2));
