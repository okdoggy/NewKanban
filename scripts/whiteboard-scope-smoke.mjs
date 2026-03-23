import { io } from "socket.io-client";

const BASE_URL = process.env.QA_BASE_URL ?? "http://127.0.0.1:3002";
const ACCOUNT_ID = process.env.QA_ACCOUNT_ID ?? "whiteboard.qa";
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

async function requestJson(path, options = {}, jar = null) {
  const response = await request(path, options, jar);
  const text = await response.text();
  return { response, payload: text ? JSON.parse(text) : null };
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
  const login = await postJson("/api/auth/login", { accountId, password: PASSWORD }, jar);
  assert(login.response.ok, `Login failed: ${login.response.status} ${login.payload?.message ?? ""}`);
  const bootstrap = await requestJson("/api/bootstrap", {}, jar);
  assert(bootstrap.response.ok, `Bootstrap failed: ${bootstrap.response.status}`);
  return { jar, bootstrap: bootstrap.payload };
}

function connectSocket(jar, label) {
  const cookie = jarToCookie(jar);
  const socket = io(BASE_URL, {
    transports: ["websocket", "polling"],
    reconnection: false,
    extraHeaders: cookie ? { Cookie: cookie } : undefined,
  });
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`${label} socket connect timed out`)), 12_000);
    socket.once("connect", () => {
      clearTimeout(timeoutId);
      socket.emit("presence:join", {
        deviceId: `${label}-${Date.now()}`,
        currentView: "collaborate",
        connectedAt: new Date().toISOString(),
      });
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`${event} timed out`)), 12_000);
    socket.emit(event, payload, (ack) => {
      clearTimeout(timeoutId);
      if (ack?.ok) resolve(ack);
      else reject(new Error(ack?.error ?? `${event} failed`));
    });
  });
}

function buildScene(label) {
  return {
    elements: [
      {
        id: `text-${label}`,
        type: "text",
        x: 120,
        y: 120,
        width: 220,
        height: 40,
        angle: 0,
        strokeColor: "#0f172a",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: 1,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        text: label,
        fontSize: 28,
        fontFamily: 1,
        textAlign: "left",
        verticalAlign: "top",
        baseline: 24,
        containerId: null,
        originalText: label,
        lineHeight: 1.25,
      },
    ],
    appState: {
      viewBackgroundColor: "#ffffff",
      theme: "light",
      scrollX: 0,
      scrollY: 0,
      zoom: { value: 1 },
    },
    files: {},
    version: Date.now(),
    updatedAt: new Date().toISOString(),
    activeTemplateId: "blank",
    templates: [],
  };
}

async function main() {
  await waitForReady();
  const { jar } = await login(ACCOUNT_ID);

  const defaultLabel = `Guest whiteboard ${Date.now()}`;
  const scopedWorkspaceName = `Whiteboard Scope ${Date.now()}`;
  const scopedLabel = `Scoped whiteboard ${Date.now()}`;

  const defaultSocket = await connectSocket(jar, "whiteboard-default");
  await emitAck(defaultSocket, "whiteboard:save", buildScene(defaultLabel));
  defaultSocket.disconnect();

  let bootstrap = await requestJson("/api/bootstrap", {}, jar);
  assert(bootstrap.response.ok, "Bootstrap after default whiteboard save failed.");
  assert(bootstrap.payload?.workspace?.id === DEFAULT_WORKSPACE_ID, "Expected default workspace to be active.");
  assert(bootstrap.payload?.workspace?.whiteboardScene?.elements?.some((element) => element.text === defaultLabel), "Default workspace whiteboard scene was not stored.");

  const createWorkspace = await postJson("/api/workspaces/create", { name: scopedWorkspaceName }, jar);
  assert(createWorkspace.response.ok, `Workspace creation failed: ${createWorkspace.payload?.message ?? createWorkspace.response.status}`);

  bootstrap = await requestJson("/api/bootstrap", {}, jar);
  assert(bootstrap.response.ok, "Bootstrap after scoped workspace creation failed.");
  const scopedWorkspaceId = bootstrap.payload?.activeWorkspaceId;
  assert(scopedWorkspaceId && scopedWorkspaceId !== DEFAULT_WORKSPACE_ID, "Scoped workspace id was not activated.");
  assert(!bootstrap.payload?.workspace?.whiteboardScene, "New workspace should start with an empty whiteboard scene.");

  const scopedSocket = await connectSocket(jar, "whiteboard-scoped");
  await emitAck(scopedSocket, "whiteboard:save", buildScene(scopedLabel));
  scopedSocket.disconnect();

  bootstrap = await requestJson("/api/bootstrap", {}, jar);
  assert(bootstrap.response.ok, "Bootstrap after scoped whiteboard save failed.");
  assert(bootstrap.payload?.workspace?.whiteboardScene?.elements?.some((element) => element.text === scopedLabel), "Scoped workspace whiteboard scene was not stored.");
  assert(!bootstrap.payload?.workspace?.whiteboardScene?.elements?.some((element) => element.text === defaultLabel), "Default workspace whiteboard leaked into scoped workspace.");

  const switchBack = await postJson("/api/workspaces/select", { workspaceId: DEFAULT_WORKSPACE_ID }, jar);
  assert(switchBack.response.ok, `Switching back to default workspace failed: ${switchBack.payload?.message ?? switchBack.response.status}`);

  bootstrap = await requestJson("/api/bootstrap", {}, jar);
  assert(bootstrap.response.ok, "Bootstrap after switching back failed.");
  assert(bootstrap.payload?.workspace?.whiteboardScene?.elements?.some((element) => element.text === defaultLabel), "Default workspace whiteboard scene was not restored.");
  assert(!bootstrap.payload?.workspace?.whiteboardScene?.elements?.some((element) => element.text === scopedLabel), "Scoped workspace whiteboard leaked into default workspace.");

  console.log("qa:whiteboard passed");
  console.log(JSON.stringify({
    baseUrl: BASE_URL,
    accountId: ACCOUNT_ID,
    defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
    scopedWorkspaceId,
    defaultLabel,
    scopedLabel,
  }, null, 2));
}

await main();
