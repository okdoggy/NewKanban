import { io } from "socket.io-client";

const BASE_URL = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const USER_A = process.env.QA_USER_A ?? "admin.kim";
const USER_B = process.env.QA_USER_B ?? "kildong.hong";
const PASSWORD = process.env.QA_PASSWORD ?? "1234";
const DEFAULT_WORKSPACE_ID = process.env.WORKSPACE_ID ?? "visualai-guest";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

async function request(path, options = {}, jar = null) {
  const headers = new Headers(options.headers ?? {});
  if (jar && Object.keys(jar).length) headers.set("cookie", jarToCookie(jar));
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (jar) mergeCookies(response.headers, jar);
  return response;
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function requestJson(path, options = {}, jar = null) {
  const response = await request(path, options, jar);
  const payload = await readJson(response).catch(() => null);
  return { response, payload };
}

async function postJson(path, body, jar) {
  return requestJson(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, jar);
}

async function waitForReady() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await fetch(`${BASE_URL}/api/bootstrap`, { cache: "no-store" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`Server at ${BASE_URL} did not become ready.`);
}

async function login(accountId) {
  const jar = {};
  const { response, payload } = await postJson("/api/auth/login", { accountId, password: PASSWORD }, jar);
  assert(response.ok, `Login failed for ${accountId}: ${response.status} ${payload?.message ?? ""}`);
  const bootstrap = await requestJson("/api/bootstrap", {}, jar);
  assert(bootstrap.response.ok, `Bootstrap failed for ${accountId}: ${bootstrap.response.status}`);
  assert(bootstrap.payload?.workspace?.name === "VisualAI-Guest", `${accountId} did not enter VisualAI-Guest.`);
  assert(bootstrap.payload?.currentUser?.role === "owner", `${accountId} did not start as owner in VisualAI-Guest.`);
  return { jar, bootstrap: bootstrap.payload };
}

function waitForSocketEvent(socket, event, predicate = () => true, timeoutMs = 12_000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`${event} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timeoutId);
      socket.off(event, handler);
      resolve(payload);
    };

    socket.on(event, handler);
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`${event} ack timed out`)), 12_000);
    socket.emit(event, payload, (ack) => {
      clearTimeout(timeoutId);
      if (ack?.ok) resolve(ack);
      else reject(new Error(ack?.error ?? `${event} failed`));
    });
  });
}

async function connectSocket(label, jar, currentView = "home") {
  const cookie = jarToCookie(jar);
  const socket = io(BASE_URL, {
    transports: ["websocket", "polling"],
    reconnection: false,
    extraHeaders: cookie ? { Cookie: cookie } : undefined,
  });

  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`${label} socket connect timed out`)), 12_000);
    socket.once("connect", () => {
      clearTimeout(timeoutId);
      resolve(undefined);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });

  const snapshotPromise = waitForSocketEvent(socket, "workspace:snapshot", () => true, 12_000);
  socket.emit("presence:join", {
    deviceId: `${label}-${Date.now()}`,
    currentView,
    connectedAt: new Date().toISOString(),
  });
  const initialWorkspace = await snapshotPromise;
  return { socket, initialWorkspace };
}

async function main() {
  await waitForReady();

  const userA = await login(USER_A);
  const userB = await login(USER_B);

  const socketA = await connectSocket("user-a-default", userA.jar);
  const socketB = await connectSocket("user-b-default", userB.jar);

  const today = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sharedTaskTitle = `LAN sync task ${Date.now()}`;
  const sharedEventTitle = `LAN sync event ${Date.now()}`;

  const sharedTaskSnapshot = waitForSocketEvent(
    socketB.socket,
    "workspace:snapshot",
    (workspace) => Array.isArray(workspace?.tasks) && workspace.tasks.some((task) => task.title === sharedTaskTitle),
  );
  await emitAck(socketA.socket, "task:create", {
    title: sharedTaskTitle,
    description: "Created from the LAN realtime smoke test.",
    status: "todo",
    priority: "medium",
    startDate: today,
    dueDate,
  });
  const sharedWorkspaceAfterTask = await sharedTaskSnapshot;
  const sharedTask = sharedWorkspaceAfterTask.tasks.find((task) => task.title === sharedTaskTitle);
  assert(sharedTask, "Second client did not receive the shared task in realtime.");

  const sharedEventSnapshot = waitForSocketEvent(
    socketB.socket,
    "workspace:snapshot",
    (workspace) => Array.isArray(workspace?.agenda) && workspace.agenda.some((event) => event.title === sharedEventTitle),
  );
  await emitAck(socketA.socket, "event:create", {
    title: sharedEventTitle,
    start: `${today}T09:00:00.000Z`,
    end: `${today}T09:30:00.000Z`,
    type: "planning",
    description: "Realtime event sync test.",
    relatedTaskId: sharedTask.id,
    recurrence: "none",
    attendees: 2,
  });
  const sharedWorkspaceAfterEvent = await sharedEventSnapshot;
  assert(sharedWorkspaceAfterEvent.agenda.some((event) => event.title === sharedEventTitle), "Second client did not receive the shared event in realtime.");

  const scopedWorkspaceName = `LAN Scope ${Date.now()}`;
  const createWorkspaceResult = await postJson("/api/workspaces/create", { name: scopedWorkspaceName }, userA.jar);
  assert(createWorkspaceResult.response.ok, `Workspace creation failed: ${createWorkspaceResult.payload?.message ?? createWorkspaceResult.response.status}`);

  const scopedBootstrap = await requestJson("/api/bootstrap", {}, userA.jar);
  assert(scopedBootstrap.response.ok, "Bootstrap after workspace creation failed for user A.");
  assert(scopedBootstrap.payload?.workspace?.name === scopedWorkspaceName, "New workspace did not become active for user A.");
  const scopedWorkspaceId = scopedBootstrap.payload?.activeWorkspaceId;
  assert(scopedWorkspaceId && scopedWorkspaceId !== DEFAULT_WORKSPACE_ID, "New workspace id was not returned.");

  const socketAScoped = await connectSocket("user-a-scoped", userA.jar);
  const scopedTaskTitle = `Scoped task ${Date.now()}`;
  const scopedTaskSnapshot = waitForSocketEvent(
    socketAScoped.socket,
    "workspace:snapshot",
    (workspace) => Array.isArray(workspace?.tasks) && workspace.tasks.some((task) => task.title === scopedTaskTitle),
  );
  await emitAck(socketAScoped.socket, "task:create", {
    title: scopedTaskTitle,
    description: "This task should stay inside the new workspace only.",
    status: "todo",
    priority: "high",
    startDate: today,
    dueDate,
  });
  const scopedWorkspaceAfterTask = await scopedTaskSnapshot;
  assert(scopedWorkspaceAfterTask.tasks.some((task) => task.title === scopedTaskTitle), "Scoped workspace task was not stored in the new workspace.");

  const switchBack = await postJson("/api/workspaces/select", { workspaceId: DEFAULT_WORKSPACE_ID }, userA.jar);
  assert(switchBack.response.ok, `Switch back to default workspace failed: ${switchBack.payload?.message ?? switchBack.response.status}`);
  const defaultBootstrap = await requestJson("/api/bootstrap", {}, userA.jar);
  assert(defaultBootstrap.response.ok, "Bootstrap after switching back failed for user A.");
  assert(!defaultBootstrap.payload?.workspace?.tasks?.some((task) => task.title === scopedTaskTitle), "Scoped task leaked into the default workspace.");

  const ownerRefresh = waitForSocketEvent(socketA.socket, "session:refresh", () => true, 12_000);
  const joinResult = await postJson("/api/workspaces/join", { workspaceId: scopedWorkspaceId }, userB.jar);
  assert(joinResult.response.ok, `Join request failed: ${joinResult.payload?.message ?? joinResult.response.status}`);
  await ownerRefresh;

  const ownerNotifications = await requestJson("/api/notifications", {}, userA.jar);
  assert(ownerNotifications.response.ok, "Owner notifications could not be loaded.");
  const joinRequestNotification = ownerNotifications.payload?.notifications?.find((notification) => notification.workspaceId === scopedWorkspaceId && notification.requestId);
  assert(joinRequestNotification, "Owner did not receive the join request notification.");

  const switchOwnerToScoped = await postJson("/api/workspaces/select", { workspaceId: scopedWorkspaceId }, userA.jar);
  assert(switchOwnerToScoped.response.ok, `Switching owner back to scoped workspace failed: ${switchOwnerToScoped.payload?.message ?? switchOwnerToScoped.response.status}`);

  const requesterRefresh = waitForSocketEvent(socketB.socket, "session:refresh", () => true, 12_000);
  const approveResult = await postJson("/api/workspaces/requests/respond", { requestId: joinRequestNotification.requestId, decision: "approve" }, userA.jar);
  assert(approveResult.response.ok, `Join request approval failed: ${approveResult.payload?.message ?? approveResult.response.status}`);
  await requesterRefresh;

  const userBWorkspaces = await requestJson("/api/workspaces", {}, userB.jar);
  assert(userBWorkspaces.response.ok, "Workspace list for user B could not be loaded.");
  assert(userBWorkspaces.payload?.workspaces?.some((workspace) => workspace.id === scopedWorkspaceId), "Approved workspace did not appear for the requester.");

  const switchBToScoped = await postJson("/api/workspaces/select", { workspaceId: scopedWorkspaceId }, userB.jar);
  assert(switchBToScoped.response.ok, `Switching user B to the scoped workspace failed: ${switchBToScoped.payload?.message ?? switchBToScoped.response.status}`);
  const userBScopedBootstrap = await requestJson("/api/bootstrap", {}, userB.jar);
  assert(userBScopedBootstrap.response.ok, "Scoped bootstrap for user B failed.");
  assert(userBScopedBootstrap.payload?.workspace?.tasks?.some((task) => task.title === scopedTaskTitle), "Approved requester could not see the workspace-scoped task from MongoDB.");

  socketA.socket.disconnect();
  socketB.socket.disconnect();
  socketAScoped.socket.disconnect();

  console.log("qa:lan passed");
  console.log(JSON.stringify({
    baseUrl: BASE_URL,
    sharedTaskTitle,
    sharedEventTitle,
    scopedWorkspaceId,
    scopedWorkspaceName,
    scopedTaskTitle,
  }, null, 2));
}

await main();
