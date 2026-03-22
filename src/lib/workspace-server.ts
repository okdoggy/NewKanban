import type { Db } from "mongodb";

import { DEFAULT_AUTOMATION } from "@/components/workspace/config";
import { DEFAULT_WORKSPACE_ID } from "@/lib/auth";
import {
  ensureDefaultOwner,
  getAuthContextFromToken,
  listWorkspaceMembers,
} from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";
import type {
  AnalyticsSummary,
  DeploymentInfo,
  EnterpriseMeta,
  PresenceMember,
  TaskItem,
  UserDirectoryEntry,
  WhiteboardNote,
  WhiteboardScene,
  Workspace,
  WorkspaceSnapshot,
} from "@/lib/types";

const WORKSPACE_ID = process.env.WORKSPACE_ID ?? DEFAULT_WORKSPACE_ID;
const PRESENCE_STALE_MS = 75_000;
const enterpriseMode = process.env.ENTERPRISE_MODE === "true";
const mongoLicenseAcknowledged = process.env.MONGODB_LICENSE_ACKNOWLEDGED === "true";

type WorkspaceDocument = Workspace & { _id: string };
type PresenceDocument = PresenceMember & { _id: string };

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createEmptyWorkspaceDocument(input: { workspaceId: string; name: string; workspaceKey: string; description: string; ownerUserId?: string; createdAt: string }): WorkspaceDocument {
  return {
    _id: input.workspaceId,
    id: input.workspaceId,
    name: input.name,
    workspaceKey: input.workspaceKey,
    description: input.description,
    ownerUserId: input.ownerUserId,
    createdAt: input.createdAt,
    sprintProgress: 0,
    weeklyCapacity: 0,
    tasks: [],
    notes: [],
    whiteboardScene: null,
    agenda: [],
    activity: [],
    automation: { ...DEFAULT_AUTOMATION },
    savedViews: [],
    automationRules: [],
    automationRunsCount: 0,
    licenseAcknowledgedAt: mongoLicenseAcknowledged ? new Date().toISOString() : null,
  };
}

function computeAnalytics(workspace: Workspace): AnalyticsSummary {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const overdueTasks = workspace.tasks.filter((task) => task.status !== "done" && new Date(`${task.dueDate}T23:59:59`).getTime() < now).length;
  const dueSoonTasks = workspace.tasks.filter((task) => task.status !== "done" && new Date(`${task.dueDate}T23:59:59`).getTime() >= now && new Date(`${task.dueDate}T23:59:59`).getTime() <= now + 3 * 24 * 60 * 60 * 1000).length;
  const blockedTasks = workspace.tasks.filter((task) => task.blocked).length;
  const reviewTasks = workspace.tasks.filter((task) => task.status === "review").length;
  const doneCount = workspace.tasks.filter((task) => task.status === "done").length;
  const eventsToday = workspace.agenda.filter((event) => {
    const start = new Date(event.start);
    return start >= todayStart && start <= todayEnd;
  }).length;
  const decisionNotes = workspace.notes.filter((note) => note.section === "decisions").length;
  const convertedNotes = workspace.notes.filter((note) => Boolean(note.linkedTaskId)).length;
  return {
    overdueTasks,
    dueSoonTasks,
    blockedTasks,
    reviewTasks,
    completionRate: workspace.tasks.length > 0 ? Math.round((doneCount / workspace.tasks.length) * 100) : 0,
    eventsToday,
    decisionNotes,
    convertedNotes,
    automationRuns: workspace.automationRunsCount ?? 0,
  };
}

function buildEnterpriseMeta(): EnterpriseMeta {
  return {
    mongoLicenseAcknowledged,
    licenseWarning: enterpriseMode && !mongoLicenseAcknowledged
      ? "Enterprise mode requires explicit review of MongoDB Community Server SSPL before production rollout."
      : null,
    optionalCapabilities: ["ICS read-only sync", "S3-compatible uploads", "OIDC/SAML integration roadmap"],
  };
}

function normalizeTask(task: TaskItem): TaskItem {
  return {
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
    atRisk: task.status !== "done" && new Date(`${task.dueDate}T23:59:59`).getTime() < Date.now(),
  };
}

function normalizeNote(note: WhiteboardNote): WhiteboardNote {
  return {
    ...note,
    section: note.section ?? "ideas",
    votes: note.votes ?? 0,
    linkedTaskId: note.linkedTaskId ?? null,
    decisionOwnerName: note.decisionOwnerName ?? "",
    decisionDueDate: note.decisionDueDate ?? "",
  };
}

function normalizeWorkspaceDocument(workspace: WorkspaceDocument): WorkspaceDocument {
  return {
    ...workspace,
    tasks: (workspace.tasks ?? []).map((task) => normalizeTask(task)),
    notes: (workspace.notes ?? []).map((note) => normalizeNote(note)),
    whiteboardScene: (workspace.whiteboardScene ?? null) as WhiteboardScene | null,
    agenda: (workspace.agenda ?? []).map((event) => ({
      ...event,
      source: event.source ?? "workspace",
      readonly: event.readonly ?? false,
      recurrence: event.recurrence ?? "none",
    })),
    automation: {
      ...DEFAULT_AUTOMATION,
      ...(workspace.automation ?? {}),
    },
    savedViews: workspace.savedViews ?? [],
    automationRules:
      workspace.automationRules ?? [
        { id: "rule-task-due-sync", key: "task-due-sync", label: "Sync due dates into calendar milestones", enabled: true },
        { id: "rule-review-event", key: "review-event", label: "Create a review event when work moves into review", enabled: true },
        { id: "rule-decision-follow-up", key: "decision-follow-up", label: "Create a calendar follow-up when a decision becomes a task", enabled: false },
      ],
    automationRunsCount: workspace.automationRunsCount ?? 0,
    licenseAcknowledgedAt: workspace.licenseAcknowledgedAt ?? (mongoLicenseAcknowledged ? new Date().toISOString() : null),
  };
}

function buildDeploymentInfo(): DeploymentInfo {
  return {
    enterpriseMode,
    mongoLicenseAckRequired: enterpriseMode,
    mongoLicenseAckConfigured: mongoLicenseAcknowledged,
    message:
      enterpriseMode && !mongoLicenseAcknowledged
        ? "Enterprise mode requires explicit acknowledgement of MongoDB Community Server SSPL before production rollout."
        : undefined,
  };
}

async function listUserDirectory(db: Db): Promise<UserDirectoryEntry[]> {
  const users = await db.collection<{
    _id: string;
    email: string;
    handle: string;
    name: string;
    color: string;
  }>("users").find({}, { projection: { _id: 1, email: 1, handle: 1, name: 1, color: 1 } }).toArray();

  return users
    .map((user) => ({
      userId: user._id,
      email: user.email,
      handle: user.handle,
      name: user.name,
      color: user.color,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function prunePresence(db: Db) {
  const threshold = new Date(Date.now() - PRESENCE_STALE_MS).toISOString();
  await db.collection<PresenceDocument>("presence").deleteMany({
    lastSeen: { $lt: threshold },
  });
}

export async function ensureWorkspaceDocument(db: Db, workspaceId = WORKSPACE_ID) {
  await ensureDefaultOwner(db);

  const collection = db.collection<WorkspaceDocument>("workspaces");
  let workspace = await collection.findOne({ _id: workspaceId });

  if (!workspace) {
    const workspaceRecord = await db.collection<{ _id: string; name: string; workspaceKey: string; description: string; ownerUserId?: string; createdAt?: string }>("workspace_records").findOne({ _id: workspaceId });
    const initialWorkspace: WorkspaceDocument = createEmptyWorkspaceDocument({
      workspaceId,
      name: workspaceRecord?.name ?? "VisualAI-Guest",
      workspaceKey: workspaceRecord?.workspaceKey ?? "VISUALAI-GUEST",
      description: workspaceRecord?.description ?? "Default guest workspace",
      ownerUserId: workspaceRecord?.ownerUserId,
      createdAt: workspaceRecord?.createdAt ?? new Date().toISOString(),
    });

    await collection.insertOne(initialWorkspace);
    workspace = initialWorkspace;
  }

  const normalizedWorkspace = normalizeWorkspaceDocument(workspace);
  if (JSON.stringify(normalizedWorkspace) !== JSON.stringify(workspace)) {
    await collection.replaceOne({ _id: workspaceId }, normalizedWorkspace, { upsert: true });
  }

  return normalizedWorkspace;
}

export function sanitizeWorkspace(workspace: WorkspaceDocument): Workspace {
  const nextWorkspace = { ...workspace } as Partial<WorkspaceDocument>;
  delete nextWorkspace._id;
  return nextWorkspace as Workspace;
}

export async function mutateWorkspace(mutator: (workspace: WorkspaceDocument) => void | Promise<void>, workspaceId = WORKSPACE_ID) {
  const db = await getMongoDb();
  const collection = db.collection<WorkspaceDocument>("workspaces");
  const current = await ensureWorkspaceDocument(db, workspaceId);
  const nextWorkspace = deepClone(current);
  await mutator(nextWorkspace);
  const normalized = normalizeWorkspaceDocument(nextWorkspace);
  await collection.replaceOne({ _id: workspaceId }, normalized, { upsert: true });
  return normalized;
}

export async function getWorkspaceSnapshotByToken(token: string | undefined, workspaceId?: string): Promise<WorkspaceSnapshot | null> {
  const db = await getMongoDb();
  await prunePresence(db);
  const auth = await getAuthContextFromToken(db, token, workspaceId);
  if (!auth) return null;

  const workspace = await ensureWorkspaceDocument(db, auth.workspaceId);
  const sanitizedWorkspace = sanitizeWorkspace(workspace);
  const presence = await db
    .collection<PresenceDocument>("presence")
    .find({ workspaceId: auth.workspaceId }, { projection: { _id: 0, connectionIds: 0 } })
    .sort({ lastSeen: -1 })
    .toArray();
  const [members, userDirectory] = await Promise.all([
    listWorkspaceMembers(db, auth.workspaceId),
    listUserDirectory(db),
  ]);

  return {
    authenticated: true,
    activeWorkspaceId: auth.workspaceId,
    currentUser: auth.currentUser,
    permissions: auth.permissions,
    workspace: sanitizedWorkspace,
    presence,
    members,
    userDirectory,
    deployment: buildDeploymentInfo(),
    enterpriseMeta: buildEnterpriseMeta(),
    analytics: computeAnalytics(sanitizedWorkspace),
    externalAgenda: [],
    savedViews: sanitizedWorkspace.savedViews ?? [],
    serverTime: new Date().toISOString(),
  };
}
