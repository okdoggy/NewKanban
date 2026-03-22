const BASE_URL = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const ACCOUNT_ID = process.env.QA_ACCOUNT_ID ?? "admin.kim";
const PASSWORD = process.env.QA_PASSWORD ?? "Admin123!";

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
  body: JSON.stringify({ accountId: ACCOUNT_ID, password: PASSWORD }),
}, jar);
assert(loginResponse.ok, `Owner login failed with status ${loginResponse.status}`);

const bootstrapResponse = await request(`${BASE_URL}/api/bootstrap`, {}, jar);
assert(bootstrapResponse.ok, `Bootstrap failed with status ${bootstrapResponse.status}`);
const payload = await bootstrapResponse.json();

assert(payload.authenticated === true, "Expected authenticated bootstrap payload");
assert(Array.isArray(payload.workspace?.tasks), "Expected task array for Kanban/Gantt");
assert(Array.isArray(payload.workspace?.agenda), "Expected agenda array for Overview/Calendar");
assert(Array.isArray(payload.workspace?.notes), "Expected note array for Whiteboard");
assert(payload.workspace.name === "VisualAI-Guest", "Expected the default workspace to be VisualAI-Guest");
assert(payload.currentUser?.role === "owner", "Expected default workspace membership to start as owner");

console.log("qa:views passed");
console.log(JSON.stringify({
  tasks: payload.workspace.tasks.length,
  events: payload.workspace.agenda.length,
  notes: payload.workspace.notes.length,
  members: payload.members?.length ?? 0,
}, null, 2));
