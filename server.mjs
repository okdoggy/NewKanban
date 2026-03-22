import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { MongoClient } from "mongodb";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const dev = process.env.NODE_ENV !== "production";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const mongoUri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/newkanban";
const dbName = process.env.MONGODB_DB ?? "newkanban";
const defaultWorkspaceId = process.env.WORKSPACE_ID ?? "visualai-guest";
const presenceStaleMs = 75_000;
const sessionCookieName = "nk_session";
const activeWorkspaceCookieName = "nk_workspace";
const defaultWorkspaceName = "VisualAI-Guest";
const enterpriseMode = process.env.ENTERPRISE_MODE === "true";
const mongoLicenseAcknowledged = process.env.MONGODB_LICENSE_ACKNOWLEDGED === "true";
let requestHandler = (_req, res) => {
  res.statusCode = 503;
  res.end("Server is starting…");
};
const mongoClient = new MongoClient(mongoUri, { maxPoolSize: 20 });

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEmptyWorkspace(workspaceId, workspaceRecord = {}) {
  return {
    _id: workspaceId,
    id: workspaceId,
    name: workspaceRecord.name ?? defaultWorkspaceName,
    workspaceKey: workspaceRecord.workspaceKey ?? "VISUALAI-GUEST",
    description: workspaceRecord.description ?? "Default guest workspace",
    ownerUserId: workspaceRecord.ownerUserId,
    createdAt: workspaceRecord.createdAt ?? new Date().toISOString(),
    sprintProgress: 0,
    weeklyCapacity: 0,
    tasks: [],
    notes: [],
    whiteboardScene: null,
    agenda: [],
    activity: [],
    automation: {
      progressCompletesTask: true,
      statusSetsProgress: true,
      dueDateCreatesAgendaHold: false,
    },
    savedViews: [],
    automationRules: [],
    automationRunsCount: 0,
    licenseAcknowledgedAt: mongoLicenseAcknowledged ? new Date().toISOString() : null,
  };
}

function normalizeHandle(value = "") {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  return normalized || `user-${randomUUID().slice(0, 8)}`;
}

function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function parseMentions(body = "") {
  return Array.from(new Set((body.match(/@([a-z0-9-]+)/gi) ?? []).map((value) => value.slice(1).toLowerCase())));
}

function getRolePermissions(role) {
  if (role === "owner") {
    return {
      manageMembers: true,
      editWorkspace: true,
      editCalendar: true,
      editNotes: true,
      uploadFiles: true,
      comment: true,
    };
  }

  if (role === "editor") {
    return {
      manageMembers: false,
      editWorkspace: true,
      editCalendar: true,
      editNotes: true,
      uploadFiles: true,
      comment: true,
    };
  }

  return {
    manageMembers: false,
    editWorkspace: false,
    editCalendar: false,
    editNotes: false,
    uploadFiles: false,
    comment: true,
  };
}

function getInitials(name) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) => segment[0]?.toUpperCase() ?? "")
      .join("") || "GU"
  );
}

function parseCookies(header = "") {
  return header
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((accumulator, cookie) => {
      const [name, ...rest] = cookie.split("=");
      accumulator[name] = decodeURIComponent(rest.join("="));
      return accumulator;
    }, {});
}

function normalizeIp(ipAddress) {
  if (!ipAddress) return "unknown";
  if (ipAddress === "::1") return "127.0.0.1";
  return ipAddress.replace(/^::ffff:/, "");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeWorkspace(workspace) {
  const nextWorkspace = { ...workspace };
  delete nextWorkspace._id;
  return nextWorkspace;
}

function normalizeWorkspaceDocument(workspace) {
  return {
    ...workspace,
    tasks: (workspace.tasks ?? []).map((task) => ({
      ...task,
      comments: (task.comments ?? []).map((comment) => ({
        ...comment,
        authorUserId: comment.authorUserId ?? null,
        mentions: comment.mentions ?? [],
      })),
      commentsCount: (task.comments ?? []).length,
      attachments: task.attachments ?? [],
      dependencyIds: task.dependencyIds ?? [],
      linkedEventIds: task.linkedEventIds ?? [],
      linkedNoteId: task.linkedNoteId ?? null,
      blocked: task.blocked ?? false,
    })),
    notes: (workspace.notes ?? []).map((note) => ({
      ...note,
      section: note.section ?? "ideas",
      votes: note.votes ?? 0,
      linkedTaskId: note.linkedTaskId ?? null,
    })),
    whiteboardScene: workspace.whiteboardScene ?? null,
    agenda: (workspace.agenda ?? []).map((event) => ({
      ...event,
      recurrence: event.recurrence ?? "none",
      readonly: event.readonly ?? false,
      source: event.source ?? "workspace",
    })),
    automation: {
      progressCompletesTask: true,
      statusSetsProgress: true,
      dueDateCreatesAgendaHold: false,
      ...(workspace.automation ?? {}),
    },
    savedViews: workspace.savedViews ?? [],
    automationRules:
      workspace.automationRules ?? [
        {
          id: "rule-task-due-sync",
          key: "task-due-sync",
          label: "Sync due dates into calendar milestones",
          enabled: true,
        },
        {
          id: "rule-review-event",
          key: "review-event",
          label: "Create a review event when work moves into review",
          enabled: true,
        },
        {
          id: "rule-decision-follow-up",
          key: "decision-follow-up",
          label: "Create a calendar follow-up when a decision becomes a task",
          enabled: false,
        },
      ],
    automationRunsCount: workspace.automationRunsCount ?? 0,
    licenseAcknowledgedAt: workspace.licenseAcknowledgedAt ?? (mongoLicenseAcknowledged ? new Date().toISOString() : null),
  };
}

async function getDb() {
  await mongoClient.connect();
  return mongoClient.db(dbName);
}

async function ensureDefaultOwner(db) {
  const records = db.collection("workspace_records");
  if (!(await records.findOne({ _id: defaultWorkspaceId }))) {
    await records.insertOne({
      _id: defaultWorkspaceId,
      id: defaultWorkspaceId,
      name: defaultWorkspaceName,
      workspaceKey: "VISUALAI-GUEST",
      description: "Default guest workspace",
      createdAt: new Date().toISOString(),
    });
  }
}

async function prunePresence(db) {
  const threshold = new Date(Date.now() - presenceStaleMs).toISOString();
  await db.collection("presence").deleteMany({ lastSeen: { $lt: threshold } });
}

async function ensureWorkspaceDocument(db, workspaceId = defaultWorkspaceId) {
  await ensureDefaultOwner(db);
  const collection = db.collection("workspaces");
  let workspace = await collection.findOne({ _id: workspaceId });

  if (!workspace) {
    const workspaceRecord = await db.collection("workspace_records").findOne({ _id: workspaceId });
    workspace = createEmptyWorkspace(workspaceId, workspaceRecord ?? {});
    await collection.insertOne(workspace);
  }

  const normalizedWorkspace = normalizeWorkspaceDocument(workspace);
  if (JSON.stringify(normalizedWorkspace) !== JSON.stringify(workspace)) {
    await collection.replaceOne({ _id: workspaceId }, normalizedWorkspace, { upsert: true });
  }

  return normalizedWorkspace;
}

async function listMembers(db, workspaceId) {
  const users = await db.collection("users").find({}).toArray();
  const memberships = await db.collection("memberships").find({ workspaceId }).toArray();
  const userMap = new Map(users.map((user) => [user._id, user]));
  const rank = { owner: 0, editor: 1, viewer: 2 };

  return memberships
    .map((membership) => {
      const user = userMap.get(membership.userId);
      if (!user) return null;
      return {
        userId: user._id,
        email: user.email,
        handle: user.handle,
        name: user.name,
        color: user.color,
        locale: user.locale ?? "en",
        role: membership.role,
        emailVerified: user.emailVerified,
        mfaEnabled: user.mfaEnabled,
        joinedAt: membership.joinedAt,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.role === right.role) return left.name.localeCompare(right.name);
      return rank[left.role] - rank[right.role];
    });
}

async function getAuthContextFromCookieHeader(db, cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  const token = cookies[sessionCookieName];
  if (!token) return null;

  const now = new Date().toISOString();
  await db.collection("sessions").deleteMany({ expiresAt: { $lt: now } });
  const session = await db.collection("sessions").findOne({ tokenHash: hashSessionToken(token) });
  if (!session) return null;

  const user = await db.collection("users").findOne({ _id: session.userId });
  const memberships = user ? await db.collection("memberships").find({ userId: session.userId }).toArray() : [];
  const requestedWorkspaceId = cookies[activeWorkspaceCookieName];
  const membership =
    memberships.find((item) => item.workspaceId === requestedWorkspaceId) ??
    memberships.find((item) => item.workspaceId === session.workspaceId) ??
    memberships[0] ??
    null;
  if (!user || !membership) return null;

  if (session.workspaceId !== membership.workspaceId) {
    await db.collection("sessions").updateOne({ _id: session._id }, { $set: { workspaceId: membership.workspaceId } });
  }

  return {
    user,
    membership,
    workspaceId: membership.workspaceId,
    currentUser: {
      userId: user._id,
      email: user.email,
      handle: user.handle,
      name: user.name,
      color: user.color,
      locale: user.locale ?? "en",
      role: membership.role,
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
    },
    permissions: getRolePermissions(membership.role),
  };
}

async function readBootstrapState(db, workspaceId) {
  await prunePresence(db);
  const workspace = await ensureWorkspaceDocument(db, workspaceId);
  const presence = await db
    .collection("presence")
    .find({ workspaceId }, { projection: { _id: 0, connectionIds: 0 } })
    .sort({ lastSeen: -1 })
    .toArray();
  const members = await listMembers(db, workspaceId);

  return {
    workspace: sanitizeWorkspace(workspace),
    presence,
    members,
    serverTime: new Date().toISOString(),
  };
}

async function broadcastState(io, db, workspaceId) {
  const state = await readBootstrapState(db, workspaceId);
  io.to(`workspace:${workspaceId}`).emit("workspace:snapshot", state.workspace);
  io.to(`workspace:${workspaceId}`).emit("presence:list", state.presence);
  io.to(`workspace:${workspaceId}`).emit("members:list", state.members);
}

async function emitAuthRefresh(io) {
  io.emit("session:refresh");
}

function registerRealtimeBridge(io, db) {
  process.__newkanbanRealtimeBridge = {
    emitSessionRefresh: () => {
      io.emit("session:refresh");
    },
    emitWorkspaceRefresh: async (workspaceId) => {
      if (!workspaceId) return;
      await broadcastState(io, db, workspaceId);
    },
  };
}

function unregisterRealtimeBridge() {
  delete process.__newkanbanRealtimeBridge;
}

async function updateWorkspace(db, workspaceId, mutator) {
  const collection = db.collection("workspaces");
  const current = await ensureWorkspaceDocument(db, workspaceId);
  const nextWorkspace = deepClone(current);
  await mutator(nextWorkspace);
  const normalized = normalizeWorkspaceDocument(nextWorkspace);
  await collection.replaceOne({ _id: workspaceId }, normalized, { upsert: true });
  return normalized;
}

async function upsertPresence(db, socket, actor, payload) {
  const now = new Date().toISOString();
  const stableDeviceId = payload.deviceId ?? socket.id;
  const presenceKey = `${actor.workspaceId}:${actor.currentUser.userId}`;
  const existing = await db.collection("presence").findOne({ _id: presenceKey });
  const connectionIds = Array.from(new Set([...(existing?.connectionIds ?? []), socket.id]));
  const record = {
    id: presenceKey,
    workspaceId: actor.workspaceId,
    deviceId: stableDeviceId,
    userId: actor.currentUser.userId,
    handle: actor.currentUser.handle,
    name: actor.currentUser.name,
    color: actor.currentUser.color,
    role: actor.currentUser.role,
    initials: getInitials(actor.currentUser.name),
    ip: normalizeIp(socket.handshake.address),
    currentView: payload.currentView ?? "overview",
    lastSeen: now,
    userAgent: socket.handshake.headers["user-agent"] ?? "",
    connectedAt: existing?.connectedAt ?? payload.connectedAt ?? now,
    connectionCount: connectionIds.length,
    connectionIds,
  };
  await db.collection("presence").updateOne({ _id: presenceKey }, { $set: record }, { upsert: true });
  return record;
}

async function removePresenceConnection(db, socketId) {
  const record = await db.collection("presence").findOne({ connectionIds: socketId });
  if (!record) return;

  const nextConnectionIds = (record.connectionIds ?? []).filter((value) => value !== socketId);
  if (nextConnectionIds.length === 0) {
    await db.collection("presence").deleteOne({ _id: record._id });
    return;
  }

  await db.collection("presence").updateOne(
    { _id: record._id },
    {
      $set: {
        connectionIds: nextConnectionIds,
        connectionCount: nextConnectionIds.length,
        lastSeen: new Date().toISOString(),
      },
    },
  );
}

function buildTask(payload, actor) {
  const now = new Date().toISOString();
  const status = typeof payload.status === "string" ? payload.status : "todo";
  const priority = typeof payload.priority === "string" ? payload.priority : "medium";
  const startDate = typeof payload.startDate === "string" && payload.startDate ? payload.startDate : now.slice(0, 10);
  const dueDate =
    typeof payload.dueDate === "string" && payload.dueDate
      ? payload.dueDate
      : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    id: randomUUID(),
    title: String(payload.title ?? "").trim() || "Untitled task",
    description: String(payload.description ?? "").trim(),
    status,
    priority,
    label: String(payload.label ?? "General").trim() || "General",
    assigneeUserId: actor.currentUser.userId,
    assigneeName: actor.currentUser.name,
    assigneeColor: actor.currentUser.color,
    startDate,
    dueDate,
    progress: status === "done" ? 100 : status === "progress" ? 25 : 0,
    commentsCount: 0,
    updatesCount: 1,
    checklistDone: 0,
    checklistTotal: 3,
    comments: [],
    attachments: [],
    dependencyIds: [],
    linkedEventIds: [],
    linkedNoteId: payload.linkedNoteId ?? null,
    blocked: false,
    createdAt: now,
    updatedAt: now,
  };
}

function buildNote(payload, actor) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: payload.title,
    content: payload.content,
    tag: payload.tag,
    color: payload.color,
    section: payload.section ?? "ideas",
    votes: payload.votes ?? 0,
    linkedTaskId: payload.linkedTaskId ?? null,
    decisionOwnerName: payload.decisionOwnerName ?? "",
    decisionDueDate: payload.decisionDueDate ?? "",
    x: 120,
    y: 120,
    assigneeName: actor.currentUser.name,
    assigneeColor: actor.currentUser.color,
    createdAt: now,
    updatedAt: now,
  };
}

function buildEvent(payload, actor) {
  return {
    id: randomUUID(),
    title: payload.title,
    start: payload.start,
    end: payload.end,
    type: payload.type,
    description: payload.description ?? "",
    relatedTaskId: payload.relatedTaskId || undefined,
    attendees: Number(payload.attendees) || 1,
    location: payload.location || "",
    link: payload.link || "",
      recurrence: payload.recurrence || "none",
      readonly: Boolean(payload.readonly),
      source: payload.source || "workspace",
    generatedByRule: payload.generatedByRule || undefined,
    createdByName: actor.currentUser.name,
  };
}

function startOfDay(dateValue) {
  const value = new Date(dateValue);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addBusinessHours(dateValue, hours) {
  const value = new Date(dateValue);
  value.setHours(value.getHours() + hours);
  return value;
}

function getAutomationRule(workspace, key) {
  return (workspace.automationRules ?? []).find((rule) => rule.key === key && rule.enabled);
}

function syncTaskDueDateEvent(workspace, task, actor) {
  const rule = getAutomationRule(workspace, "task-due-sync");
  if (!rule) return;

  const start = new Date(`${task.dueDate}T16:00:00`);
  const end = new Date(`${task.dueDate}T16:30:00`);
  const existing = workspace.agenda.find((event) => event.generatedByRule === rule.id && event.relatedTaskId === task.id);
  if (existing) {
    existing.title = `${task.title} due`;
    existing.start = start.toISOString();
    existing.end = end.toISOString();
    existing.type = task.priority === "high" ? "milestone" : "upcoming";
    existing.source = "automation";
    existing.readonly = false;
    existing.createdByName = actor.currentUser.name;
  } else {
    const event = buildEvent(
      {
        title: `${task.title} due`,
        start: start.toISOString(),
        end: end.toISOString(),
        type: task.priority === "high" ? "milestone" : "upcoming",
        description: `Automatically synced due date for ${task.title}.`,
        relatedTaskId: task.id,
        attendees: 1,
        recurrence: "none",
        source: "automation",
        generatedByRule: rule.id,
      },
      actor,
    );
    workspace.agenda.push(event);
    task.linkedEventIds = Array.from(new Set([...(task.linkedEventIds ?? []), event.id]));
  }
  workspace.automationRunsCount = (workspace.automationRunsCount ?? 0) + 1;
  rule.lastRunAt = new Date().toISOString();
}

function createReviewEvent(workspace, task, actor) {
  const rule = getAutomationRule(workspace, "review-event");
  if (!rule || task.status !== "review") return;

  const existing = workspace.agenda.find((event) => event.generatedByRule === rule.id && event.relatedTaskId === task.id);
  if (existing) return;

  const base = startOfDay(`${task.dueDate}T00:00:00`);
  base.setHours(10, 0, 0, 0);
  const event = buildEvent(
    {
      title: `Review ${task.title}`,
      start: base.toISOString(),
      end: addBusinessHours(base, 1).toISOString(),
      type: "verification",
      description: `Automated review checkpoint for ${task.title}.`,
      relatedTaskId: task.id,
      attendees: 2,
      recurrence: "none",
      source: "automation",
      generatedByRule: rule.id,
    },
    actor,
  );
  workspace.agenda.push(event);
  task.linkedEventIds = Array.from(new Set([...(task.linkedEventIds ?? []), event.id]));
  workspace.automationRunsCount = (workspace.automationRunsCount ?? 0) + 1;
  rule.lastRunAt = new Date().toISOString();
}

function createDecisionFollowUpEvent(workspace, task, note, actor) {
  const rule = getAutomationRule(workspace, "decision-follow-up");
  if (!rule) return;

  const baseDate = note.decisionDueDate || task.dueDate;
  const existing = workspace.agenda.find((event) => event.generatedByRule === rule.id && event.relatedTaskId === task.id);
  if (existing) return;

  const start = new Date(`${baseDate}T09:30:00`);
  const event = buildEvent(
    {
      title: `Decision follow-up · ${task.title}`,
      start: start.toISOString(),
      end: addBusinessHours(start, 1).toISOString(),
      type: "planning",
      description: `Follow-up created from decision note ${note.title}.`,
      relatedTaskId: task.id,
      attendees: 1,
      recurrence: "none",
      source: "automation",
      generatedByRule: rule.id,
    },
    actor,
  );
  workspace.agenda.push(event);
  task.linkedEventIds = Array.from(new Set([...(task.linkedEventIds ?? []), event.id]));
  workspace.automationRunsCount = (workspace.automationRunsCount ?? 0) + 1;
  rule.lastRunAt = new Date().toISOString();
}

function makeActivity(actor, action, entityType, entityTitle) {
  return {
    id: randomUUID(),
    actorName: actor.currentUser.name,
    actorColor: actor.currentUser.color,
    action,
    entityType,
    entityTitle,
    createdAt: new Date().toISOString(),
  };
}

async function appendAuditLog(db, actor, scope, action, detail, userId = actor.currentUser.userId) {
  await db.collection("audit_logs").insertOne({
    _id: randomUUID(),
    actorName: actor.currentUser.name,
    actorEmail: actor.currentUser.email,
    actorUserId: actor.currentUser.userId,
    userId,
    scope,
    action,
    detail,
    createdAt: new Date().toISOString(),
  });
}

function findTask(workspace, taskId) {
  return workspace.tasks.find((task) => task.id === taskId);
}

function collectCommentIds(comments, rootCommentId) {
  const ids = new Set([rootCommentId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const comment of comments) {
      if (comment.parentId && ids.has(comment.parentId) && !ids.has(comment.id)) {
        ids.add(comment.id);
        changed = true;
      }
    }
  }
  return ids;
}

function unlinkTaskFromWorkspace(workspace, taskId) {
  workspace.tasks = workspace.tasks.filter((task) => task.id !== taskId);
  workspace.notes = workspace.notes.map((note) => note.linkedTaskId === taskId ? { ...note, linkedTaskId: null } : note);
  workspace.agenda = workspace.agenda.flatMap((event) => {
    if (event.relatedTaskId !== taskId) return [event];
    if (event.generatedByRule || event.source === "automation") return [];
    return [{ ...event, relatedTaskId: undefined }];
  });
}

function findNote(workspace, noteId) {
  return workspace.notes.find((note) => note.id === noteId);
}

function findEvent(workspace, eventId) {
  return workspace.agenda.find((event) => event.id === eventId);
}

async function main() {
  if (enterpriseMode && !mongoLicenseAcknowledged) {
    throw new Error(
      "ENTERPRISE_MODE requires MONGODB_LICENSE_ACKNOWLEDGED=true after internal license review.",
    );
  }

  const db = await getDb();
  await ensureWorkspaceDocument(db);

  if ((process.env.ENTERPRISE_MODE === "true" || process.env.NODE_ENV === "production") && !mongoLicenseAcknowledged) {
    console.warn("[enterprise] MONGODB_LICENSE_ACKNOWLEDGED is not set. MongoDB Community Server licensing must be reviewed before enterprise deployment.");
  }

  const httpServer = createServer((req, res) => requestHandler(req, res));
  const nextApp = next({ dev, hostname, port, httpServer });
  requestHandler = nextApp.getRequestHandler();
  await nextApp.prepare();
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });
  registerRealtimeBridge(io, db);

  io.on("connection", (socket) => {
    const withAuth = (permissionKey, handler) => async (payload = {}, ack) => {
      try {
        const actor = await getAuthContextFromCookieHeader(db, socket.handshake.headers.cookie ?? "");
        if (!actor) {
          if (typeof ack === "function") ack({ ok: false, error: "Authentication required." });
          socket.emit("session:refresh");
          return;
        }

        if (permissionKey && !actor.permissions[permissionKey]) {
          if (typeof ack === "function") ack({ ok: false, error: "Insufficient permission." });
          return;
        }

        await handler(payload, actor);
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        console.error("Socket event failed", error);
        if (typeof ack === "function") {
          ack({ ok: false, error: error instanceof Error ? error.message : "Unknown error" });
        }
      }
    };

    socket.on(
      "presence:join",
      withAuth(null, async (payload, actor) => {
        await upsertPresence(db, socket, actor, payload);
        socket.join(`workspace:${actor.workspaceId}`);
        socket.join(`user:${actor.currentUser.userId}`);
        const state = await readBootstrapState(db, actor.workspaceId);
        socket.emit("auth:user", actor.currentUser);
        socket.emit("workspace:snapshot", state.workspace);
        socket.emit("presence:list", state.presence);
        socket.emit("members:list", state.members);
        io.to(`workspace:${actor.workspaceId}`).emit("presence:list", state.presence);
      }),
    );

    socket.on(
      "presence:heartbeat",
      withAuth(null, async (payload, actor) => {
        await upsertPresence(db, socket, actor, payload);
        io.to(`workspace:${actor.workspaceId}`).emit("presence:list", (await readBootstrapState(db, actor.workspaceId)).presence);
      }),
    );

    socket.on(
      "presence:view",
      withAuth(null, async (payload, actor) => {
        await upsertPresence(db, socket, actor, payload);
        io.to(`workspace:${actor.workspaceId}`).emit("presence:list", (await readBootstrapState(db, actor.workspaceId)).presence);
      }),
    );

    socket.on(
      "workspace:request",
      withAuth(null, async (_payload, actor) => {
        const state = await readBootstrapState(db, actor.workspaceId);
        socket.emit("auth:user", actor.currentUser);
        socket.emit("workspace:snapshot", state.workspace);
        socket.emit("presence:list", state.presence);
        socket.emit("members:list", state.members);
      }),
    );

    socket.on(
      "workspace:sync",
      withAuth(null, async (_payload, actor) => {
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "profile:update",
      withAuth("comment", async (payload, actor) => {
        const users = db.collection("users");
        const normalizedHandle = normalizeHandle(payload.handle ?? actor.currentUser.handle);
        const existing = await users.findOne({ handle: normalizedHandle, _id: { $ne: actor.currentUser.userId } });
        if (existing) throw new Error("Handle is already taken.");

        await users.updateOne(
          { _id: actor.currentUser.userId },
          {
            $set: {
              name: String(payload.name ?? actor.currentUser.name).trim(),
              handle: normalizedHandle,
              color: String(payload.color ?? actor.currentUser.color),
              locale: payload.locale === "ko" ? "ko" : payload.locale === "en" ? "en" : (actor.currentUser.locale ?? "en"),
            },
          },
        );

        await db.collection("presence").updateMany(
          { userId: actor.currentUser.userId },
          {
            $set: {
              name: String(payload.name ?? actor.currentUser.name).trim(),
              handle: normalizedHandle,
              color: String(payload.color ?? actor.currentUser.color),
              initials: getInitials(String(payload.name ?? actor.currentUser.name).trim()),
            },
          },
        );

        await broadcastState(io, db, actor.workspaceId);
        await emitAuthRefresh(io);
        await appendAuditLog(db, actor, "security", "profile-update", `${actor.currentUser.email} updated their profile.`);
      }),
    );

    socket.on(
      "member:role",
      withAuth("manageMembers", async (payload, actor) => {
        await db.collection("memberships").updateOne(
          { _id: `${actor.workspaceId}:${payload.userId}` },
          { $set: { role: payload.role } },
        );
        await db.collection("presence").updateMany({ workspaceId: actor.workspaceId, userId: payload.userId }, { $set: { role: payload.role } });
        await broadcastState(io, db, actor.workspaceId);
        await emitAuthRefresh(io);
        await appendAuditLog(db, actor, "security", "member-role", `Updated member ${payload.userId} role to ${payload.role}.`, payload.userId);
      }),
    );

    socket.on(
      "task:create",
      withAuth("editWorkspace", async (payload, actor) => {
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          const task = buildTask(payload, actor);
          workspace.tasks.unshift(task);
          syncTaskDueDateEvent(workspace, task, actor);
          workspace.activity.unshift(makeActivity(actor, "created", "task", task.title));
          workspace.activity = workspace.activity.slice(0, 20);
        });
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "task:update",
      withAuth("editWorkspace", async (payload, actor) => {
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          const taskIndex = workspace.tasks.findIndex((task) => task.id === payload.taskId);
          if (taskIndex === -1) return;
          const task = workspace.tasks[taskIndex];
          const previousStatus = task.status;

          if (typeof payload.status === "string") {
            task.status = payload.status;
            if (payload.status === "done") task.progress = 100;
          }
          if (typeof payload.priority === "string") task.priority = payload.priority;
          if (typeof payload.progress === "number") task.progress = clamp(payload.progress, 0, 100);
          if (typeof payload.title === "string") task.title = payload.title;
          if (typeof payload.description === "string") task.description = payload.description;
          if (typeof payload.label === "string") task.label = payload.label;
          if (typeof payload.startDate === "string") task.startDate = payload.startDate;
          if (typeof payload.dueDate === "string") task.dueDate = payload.dueDate;
          if (Array.isArray(payload.dependencyIds)) task.dependencyIds = payload.dependencyIds.filter((value) => typeof value === "string" && value !== task.id);
          if (typeof payload.linkedNoteId === "string" || payload.linkedNoteId === null) task.linkedNoteId = payload.linkedNoteId;
          if (typeof payload.blocked === "boolean") task.blocked = payload.blocked;
          if (typeof payload.assigneeUserId === "string" && payload.assigneeUserId) {
            const assignee = await db.collection("users").findOne({ _id: payload.assigneeUserId });
            if (assignee) {
              task.assigneeUserId = assignee._id;
              task.assigneeName = assignee.name;
              task.assigneeColor = assignee.color;
            }
          } else if (typeof payload.assigneeName === "string" && typeof payload.assigneeColor === "string") {
            task.assigneeName = payload.assigneeName;
            task.assigneeColor = payload.assigneeColor;
          }
          task.updatesCount += 1;
          task.updatedAt = new Date().toISOString();

          if (typeof payload.status === "string" && payload.status !== previousStatus) {
            const [movedTask] = workspace.tasks.splice(taskIndex, 1);
            const insertIndex = workspace.tasks.findIndex((item) => item.status === payload.status);
            if (insertIndex === -1) workspace.tasks.push(movedTask);
            else workspace.tasks.splice(insertIndex, 0, movedTask);
          }

          syncTaskDueDateEvent(workspace, task, actor);
          if (task.status !== previousStatus) {
            createReviewEvent(workspace, task, actor);
          }
          workspace.agenda.sort((left, right) => left.start.localeCompare(right.start));

          workspace.activity.unshift(
            makeActivity(actor, task.status === "done" ? "completed" : "updated", "task", task.title),
          );
          workspace.activity = workspace.activity.slice(0, 20);
        });
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "task:delete",
      withAuth("editWorkspace", async (payload, actor) => {
        let taskTitle = "";
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          const task = findTask(workspace, payload.taskId);
          if (!task) return;
          taskTitle = task.title;
          unlinkTaskFromWorkspace(workspace, task.id);
          workspace.activity.unshift(makeActivity(actor, "deleted", "task", task.title));
          workspace.activity = workspace.activity.slice(0, 20);
        });
        if (taskTitle) {
          await appendAuditLog(db, actor, "workspace", "task-delete", `Deleted task ${taskTitle}.`);
        }
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "task:comment",
      withAuth("comment", async (payload, actor) => {
        let mentionedHandles = [];
        let taskTitle = "";
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          const task = findTask(workspace, payload.taskId);
          if (!task || typeof payload.body !== "string" || !payload.body.trim()) return;
          mentionedHandles = parseMentions(payload.body);
          taskTitle = task.title;
          task.comments.unshift({
            id: randomUUID(),
            authorUserId: actor.currentUser.userId,
            authorName: actor.currentUser.name,
            authorColor: actor.currentUser.color,
            body: payload.body.trim(),
            mentions: mentionedHandles,
            parentId: payload.parentId ?? null,
            createdAt: new Date().toISOString(),
          });
          task.commentsCount = task.comments.length;
          task.updatedAt = new Date().toISOString();
          workspace.activity.unshift(makeActivity(actor, "commented on", "task", task.title));
          workspace.activity = workspace.activity.slice(0, 20);
        });
        await appendAuditLog(db, actor, "workspace", "task-comment", `Commented on task ${taskTitle}.`);
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "task:comment-delete",
      withAuth("comment", async (payload, actor) => {
        let taskTitle = "";
        let deletedCount = 0;
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          const task = findTask(workspace, payload.taskId);
          if (!task) return;
          const targetComment = task.comments.find((comment) => comment.id === payload.commentId);
          if (!targetComment) return;
          const canDelete = actor.currentUser.role === "owner" || targetComment.authorUserId === actor.currentUser.userId;
          if (!canDelete) throw new Error("Only the workspace owner or the comment author can delete this update.");
          const commentIds = collectCommentIds(task.comments, targetComment.id);
          deletedCount = commentIds.size;
          taskTitle = task.title;
          task.comments = task.comments.filter((comment) => !commentIds.has(comment.id));
          task.commentsCount = task.comments.length;
          task.updatesCount = Math.max(0, task.updatesCount + 1);
          task.updatedAt = new Date().toISOString();
          workspace.activity.unshift(makeActivity(actor, "deleted comment on", "task", task.title));
          workspace.activity = workspace.activity.slice(0, 20);
        });
        if (taskTitle) {
          await appendAuditLog(db, actor, "workspace", "task-comment-delete", `Deleted ${deletedCount} update(s) from task ${taskTitle}.`);
        }
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "note:create",
      withAuth("editNotes", async (payload, actor) => {
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          const note = buildNote(payload, actor);
          workspace.notes.push(note);
          workspace.activity.unshift(makeActivity(actor, "added", "note", note.title));
          workspace.activity = workspace.activity.slice(0, 20);
        });
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "note:update",
      withAuth("editNotes", async (payload, actor) => {
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          const note = findNote(workspace, payload.noteId);
          if (!note) return;
          if (typeof payload.title === "string") note.title = payload.title;
          if (typeof payload.content === "string") note.content = payload.content;
          if (typeof payload.tag === "string") note.tag = payload.tag;
          if (typeof payload.color === "string") note.color = payload.color;
          if (typeof payload.section === "string") note.section = payload.section;
          if (typeof payload.linkedTaskId === "string" || payload.linkedTaskId === null) note.linkedTaskId = payload.linkedTaskId;
          if (typeof payload.decisionOwnerName === "string") note.decisionOwnerName = payload.decisionOwnerName;
          if (typeof payload.decisionDueDate === "string") note.decisionDueDate = payload.decisionDueDate;
          note.assigneeName = actor.currentUser.name;
          note.assigneeColor = actor.currentUser.color;
          note.updatedAt = new Date().toISOString();
          workspace.activity.unshift(makeActivity(actor, "updated", "note", note.title));
          workspace.activity = workspace.activity.slice(0, 20);
        });
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "note:move",
      withAuth("editNotes", async (payload, actor) => {
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          const note = findNote(workspace, payload.noteId);
          if (!note) return;
          if (typeof payload.x === "number") note.x = clamp(payload.x, 0, 920);
          if (typeof payload.y === "number") note.y = clamp(payload.y, 0, 520);
          note.updatedAt = new Date().toISOString();
        });
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "note:vote",
      withAuth("comment", async (payload, actor) => {
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          const note = findNote(workspace, payload.noteId);
          if (!note) return;
          note.votes = Math.max(0, Number(note.votes ?? 0) + (payload.delta === -1 ? -1 : 1));
          note.updatedAt = new Date().toISOString();
          workspace.activity.unshift(makeActivity(actor, "voted on", "note", note.title));
          workspace.activity = workspace.activity.slice(0, 20);
        });
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "note:convert-task",
      withAuth("editWorkspace", async (payload, actor) => {
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          const note = findNote(workspace, payload.noteId);
          if (!note) return;
          const task = buildTask(
            {
              title: payload.title || note.title,
              description: payload.description || note.content,
              status: "todo",
              priority: payload.priority || "medium",
              label: payload.label || note.tag || "Decision",
              startDate: new Date().toISOString().slice(0, 10),
              dueDate: payload.dueDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
              linkedNoteId: note.id,
            },
            actor,
          );
          workspace.tasks.unshift(task);
          note.linkedTaskId = task.id;
          if (note.section !== "actions") {
            note.section = "actions";
          }
          syncTaskDueDateEvent(workspace, task, actor);
          createDecisionFollowUpEvent(workspace, task, note, actor);
          workspace.activity.unshift(makeActivity(actor, "converted", "note", note.title));
          workspace.activity = workspace.activity.slice(0, 20);
        });
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "whiteboard:save",
      withAuth("editNotes", async (payload, actor) => {
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          workspace.whiteboardScene = {
            elements: Array.isArray(payload.elements) ? payload.elements : [],
            appState: typeof payload.appState === "object" && payload.appState ? payload.appState : {},
            files: typeof payload.files === "object" && payload.files ? payload.files : {},
            activeTemplateId: typeof payload.activeTemplateId === "string" ? payload.activeTemplateId : undefined,
            templates: Array.isArray(payload.templates) ? payload.templates : undefined,
            version: Number(payload.version) || Date.now(),
            updatedAt: new Date().toISOString(),
            updatedByName: actor.currentUser.name,
            updatedByColor: actor.currentUser.color,
          };
          workspace.activity.unshift(makeActivity(actor, "updated", "note", "Whiteboard canvas"));
          workspace.activity = workspace.activity.slice(0, 20);
        });
        void broadcastState(io, db, actor.workspaceId).catch((error) => {
          console.error("Failed to broadcast whiteboard state", error);
        });
      }),
    );

    socket.on(
      "event:create",
      withAuth("editCalendar", async (payload, actor) => {
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          const event = buildEvent(payload, actor);
          workspace.agenda.push(event);
          if (event.relatedTaskId) {
            const task = findTask(workspace, event.relatedTaskId);
            if (task) {
              task.linkedEventIds = Array.from(new Set([...(task.linkedEventIds ?? []), event.id]));
              task.updatedAt = new Date().toISOString();
            }
          }
          workspace.agenda.sort((left, right) => left.start.localeCompare(right.start));
          workspace.activity.unshift(makeActivity(actor, "scheduled", "event", event.title));
          workspace.activity = workspace.activity.slice(0, 20);
        });
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "event:update",
      withAuth("editCalendar", async (payload, actor) => {
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          const event = findEvent(workspace, payload.eventId);
          if (!event) return;
          const previousTaskId = event.relatedTaskId;
          if (typeof payload.title === "string") event.title = payload.title;
          if (typeof payload.start === "string") event.start = payload.start;
          if (typeof payload.end === "string") event.end = payload.end;
          if (typeof payload.type === "string") event.type = payload.type;
          if (typeof payload.description === "string") event.description = payload.description;
          if (typeof payload.location === "string") event.location = payload.location;
          if (typeof payload.link === "string") event.link = payload.link;
          if (typeof payload.relatedTaskId === "string") event.relatedTaskId = payload.relatedTaskId || undefined;
          if (typeof payload.attendees === "number") event.attendees = payload.attendees;
          if (typeof payload.recurrence === "string") event.recurrence = payload.recurrence;
          event.createdByName = actor.currentUser.name;
          if (previousTaskId && previousTaskId !== event.relatedTaskId) {
            const previousTask = findTask(workspace, previousTaskId);
            if (previousTask) {
              previousTask.linkedEventIds = (previousTask.linkedEventIds ?? []).filter((item) => item !== event.id);
            }
          }
          if (event.relatedTaskId) {
            const nextTask = findTask(workspace, event.relatedTaskId);
            if (nextTask) {
              nextTask.linkedEventIds = Array.from(new Set([...(nextTask.linkedEventIds ?? []), event.id]));
              nextTask.updatedAt = new Date().toISOString();
            }
          }
          workspace.agenda.sort((left, right) => left.start.localeCompare(right.start));
          workspace.activity.unshift(makeActivity(actor, "updated", "event", event.title));
          workspace.activity = workspace.activity.slice(0, 20);
        });
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "event:delete",
      withAuth("editCalendar", async (payload, actor) => {
        let eventTitle = "";
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          const event = findEvent(workspace, payload.eventId);
          if (!event) return;
          eventTitle = event.title;
          if (event.relatedTaskId) {
            const task = findTask(workspace, event.relatedTaskId);
            if (task) {
              task.linkedEventIds = (task.linkedEventIds ?? []).filter((item) => item !== event.id);
              task.updatedAt = new Date().toISOString();
            }
          }
          workspace.agenda = workspace.agenda.filter((item) => item.id !== event.id);
          workspace.activity.unshift(makeActivity(actor, "deleted", "event", event.title));
          workspace.activity = workspace.activity.slice(0, 20);
        });
        if (eventTitle) {
          await appendAuditLog(db, actor, "workspace", "event-delete", `Deleted event ${eventTitle}.`);
        }
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "saved-view:create",
      withAuth("comment", async (payload, actor) => {
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          workspace.savedViews = [
            {
              id: randomUUID(),
              name: String(payload.name ?? "Saved view").trim() || "Saved view",
              view: payload.view,
              search: String(payload.search ?? ""),
              statusFilter: payload.statusFilter ?? "all",
              priorityFilter: payload.priorityFilter ?? "all",
              sortMode: payload.sortMode ?? "due-asc",
              boardMode: payload.boardMode ?? "board",
              calendarViewMode: payload.calendarViewMode ?? "month",
              ganttZoom: payload.ganttZoom ?? "balanced",
              createdByName: actor.currentUser.name,
              createdAt: new Date().toISOString(),
            },
            ...(workspace.savedViews ?? []),
          ].slice(0, 12);
        });
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "saved-view:delete",
      withAuth("comment", async (payload, actor) => {
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          workspace.savedViews = (workspace.savedViews ?? []).filter((view) => view.id !== payload.savedViewId);
        });
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on(
      "automation:toggle",
      withAuth("manageMembers", async (payload, actor) => {
        await updateWorkspace(db, actor.workspaceId, async (workspace) => {
          const rule = (workspace.automationRules ?? []).find((item) => item.id === payload.ruleId);
          if (!rule) return;
          rule.enabled = Boolean(payload.enabled);
          rule.lastRunAt = new Date().toISOString();
          workspace.activity.unshift(makeActivity(actor, rule.enabled ? "enabled" : "disabled", "event", rule.label));
          workspace.activity = workspace.activity.slice(0, 20);
        });
        await broadcastState(io, db, actor.workspaceId);
      }),
    );

    socket.on("disconnect", async () => {
      try {
        const record = await db.collection("presence").findOne({ connectionIds: socket.id });
        await removePresenceConnection(db, socket.id);
        if (record?.workspaceId) {
          io.to(`workspace:${record.workspaceId}`).emit("presence:list", (await readBootstrapState(db, record.workspaceId)).presence);
        }
      } catch (error) {
        console.error("Failed to clean up presence", error);
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await io.close();
      await new Promise((resolve) => {
        httpServer.close(() => resolve());
      });
    } catch (error) {
      if (!(error instanceof Error) || error.code !== "ERR_SERVER_NOT_RUNNING") {
        console.error("Graceful shutdown warning", error);
      }
    } finally {
      unregisterRealtimeBridge();
      await mongoClient.close();
      process.exit(0);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Failed to start collaborative workspace server", error);
  process.exit(1);
});
