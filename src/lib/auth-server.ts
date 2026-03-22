import type { Db } from "mongodb";

import {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
  SESSION_MAX_AGE_SECONDS,
  buildOtpAuthUrl,
  generateTotpSecret,
  getRolePermissions,
  hashSessionToken,
  issueSessionToken,
  makePasswordHash,
  normalizeEmail,
  normalizeHandle,
  normalizeWorkspaceName,
  slugifyWorkspace,
  verifyPassword,
  verifyTotpCode,
} from "@/lib/auth";
import type {
  AuditLogItem,
  AuthenticatedUser,
  MemberRole,
  NotificationItem,
  PermissionSet,
  WorkspaceJoinRequest,
  WorkspaceMember,
  WorkspaceSummary,
} from "@/lib/types";

const WORKSPACE_ID = DEFAULT_WORKSPACE_ID;
const COLOR_PALETTE = ["#2b4bb9", "#4865d3", "#0ea5e9", "#14b8a6", "#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444", "#ec4899", "#d946ef", "#8b5cf6", "#6366f1", "#64748b", "#111827"];
const APP_ISSUER = process.env.APP_ISSUER ?? "NewKanban";

export interface UserDocument {
  _id: string;
  email: string;
  handle: string;
  name: string;
  color: string;
  passwordHash: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  mfaSecret?: string;
  pendingMfaSecret?: string;
  createdAt: string;
}

export interface MembershipDocument {
  _id: string;
  workspaceId: string;
  userId: string;
  role: MemberRole;
  joinedAt: string;
}

export interface WorkspaceRecordDocument {
  _id: string;
  id: string;
  name: string;
  workspaceKey: string;
  description: string;
  ownerUserId?: string;
  createdAt: string;
}

export interface SessionDocument {
  _id: string;
  tokenHash: string;
  userId: string;
  workspaceId?: string;
  createdAt: string;
  expiresAt: string;
}

export interface VerificationTokenDocument {
  _id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string | null;
}

export interface PasswordResetTokenDocument {
  _id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string | null;
}

export interface InviteDocument {
  _id: string;
  email: string;
  role: MemberRole;
  tokenHash: string;
  invitedByUserId: string;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string | null;
}

export interface MfaChallengeDocument {
  _id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface WorkspaceJoinRequestDocument {
  _id: string;
  workspaceId: string;
  requesterUserId: string;
  status: "pending" | "approved" | "rejected";
  message?: string;
  createdAt: string;
  resolvedAt?: string | null;
  resolvedByUserId?: string | null;
}

export interface NotificationDocument extends NotificationItem {
  _id: string;
  userId: string;
}

export interface AuditLogDocument extends AuditLogItem {
  _id: string;
  id: string;
  actorUserId?: string;
  userId?: string;
}

export interface AuthContext {
  user: UserDocument;
  membership: MembershipDocument;
  workspaceId: string;
  currentUser: AuthenticatedUser;
  permissions: PermissionSet;
}

function colorForSeed(seed: string) {
  const value = Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0);
  return COLOR_PALETTE[value % COLOR_PALETTE.length];
}

function buildCurrentUser(user: UserDocument, membership: MembershipDocument): AuthenticatedUser {
  return {
    userId: user._id,
    email: user.email,
    handle: user.handle,
    name: user.name,
    color: user.color,
    role: membership.role,
    emailVerified: user.emailVerified,
    mfaEnabled: user.mfaEnabled,
  };
}

function buildWorkspaceKey(name: string) {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .slice(0, 3)
    .join("-")
    .toUpperCase() || `VAI-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

async function buildUniqueWorkspaceKey(db: Db, name: string) {
  const records = db.collection<WorkspaceRecordDocument>("workspace_records");
  const base = buildWorkspaceKey(name);
  let candidate = base;
  let counter = 1;

  while (await records.findOne({ workspaceKey: candidate })) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }

  return candidate;
}

async function ensureWorkspaceRecord(db: Db, workspace: WorkspaceRecordDocument) {
  const records = db.collection<WorkspaceRecordDocument>("workspace_records");
  const existing = await records.findOne({ _id: workspace._id });
  if (!existing) {
    await records.insertOne(workspace);
  }
}

function buildDefaultWorkspaceRecord(): WorkspaceRecordDocument {
  return {
    _id: WORKSPACE_ID,
    id: WORKSPACE_ID,
    name: DEFAULT_WORKSPACE_NAME,
    workspaceKey: buildWorkspaceKey(DEFAULT_WORKSPACE_NAME),
    description: "Default guest workspace",
    createdAt: new Date().toISOString(),
  };
}

async function resolveWorkspaceMembership(
  db: Db,
  userId: string,
  requestedWorkspaceId?: string,
  fallbackWorkspaceId?: string,
) {
  const memberships = db.collection<MembershipDocument>("memberships");
  const allMemberships = await memberships.find({ userId }).toArray();
  if (allMemberships.length === 0) return null;
  const activeWorkspaceId =
    (requestedWorkspaceId && allMemberships.find((membership) => membership.workspaceId === requestedWorkspaceId)?.workspaceId) ||
    (fallbackWorkspaceId && allMemberships.find((membership) => membership.workspaceId === fallbackWorkspaceId)?.workspaceId) ||
    allMemberships[0].workspaceId;
  return allMemberships.find((membership) => membership.workspaceId === activeWorkspaceId) ?? null;
}

function issueTimedToken() {
  const rawToken = crypto.randomUUID() + crypto.randomUUID();
  return {
    rawToken,
    tokenHash: hashSessionToken(rawToken),
  };
}

async function collectionDeleteExpired(db: Db, name: string) {
  const now = new Date().toISOString();
  await db.collection(name).deleteMany({ expiresAt: { $lt: now } });
}

export async function appendAuditLog(
  db: Db,
  entry: {
    actorName: string;
    actorEmail?: string;
    actorUserId?: string;
    userId?: string;
    scope: AuditLogItem["scope"];
    action: string;
    detail: string;
  },
) {
  await db.collection<AuditLogDocument>("audit_logs").insertOne({
    _id: crypto.randomUUID(),
    id: crypto.randomUUID(),
    actorName: entry.actorName,
    actorEmail: entry.actorEmail,
    actorUserId: entry.actorUserId,
    userId: entry.userId,
    scope: entry.scope,
    action: entry.action,
    detail: entry.detail,
    createdAt: new Date().toISOString(),
  });
}

export async function listAuditLogs(db: Db, auth: AuthContext) {
  const filter = auth.membership.role === "owner" ? {} : { $or: [{ actorUserId: auth.user._id }, { userId: auth.user._id }] };
  return db.collection<AuditLogDocument>("audit_logs").find(filter).sort({ createdAt: -1 }).limit(50).toArray();
}

export async function ensureDefaultOwner(db: Db) {
  await ensureWorkspaceRecord(db, buildDefaultWorkspaceRecord());
}

export async function registerUser(
  db: Db,
  input: { email: string; password: string; name: string; handle?: string; role?: MemberRole; emailVerified?: boolean },
) {
  const users = db.collection<UserDocument>("users");
  const memberships = db.collection<MembershipDocument>("memberships");

  const email = normalizeEmail(input.email);
  const handle = normalizeHandle(input.handle ?? input.name ?? email.split("@")[0] ?? "user");
  if (await users.findOne({ email })) {
    throw new Error("Email is already registered.");
  }
  if (await users.findOne({ handle })) {
    throw new Error("Handle is already taken.");
  }

  const user: UserDocument = {
    _id: crypto.randomUUID(),
    email,
    handle,
    name: input.name.trim(),
    color: colorForSeed(email),
    passwordHash: makePasswordHash(input.password),
    emailVerified: input.emailVerified ?? false,
    mfaEnabled: false,
    createdAt: new Date().toISOString(),
  };

  await users.insertOne(user);
  await memberships.insertOne({
    _id: `${WORKSPACE_ID}:${user._id}`,
    workspaceId: WORKSPACE_ID,
    userId: user._id,
    role: input.role ?? "owner",
    joinedAt: new Date().toISOString(),
  });

  await appendAuditLog(db, {
    actorName: user.name,
    actorEmail: user.email,
    actorUserId: user._id,
    userId: user._id,
    scope: "auth",
    action: "signup",
    detail: `User ${user.email} created an account with role ${input.role ?? "owner"}.`,
  });

  return user;
}

export function buildDisplayNameFromIdentifier(identifier: string) {
  const cleaned = identifier.trim().replace(/[^a-zA-Z0-9.]+/g, ".");
  const segments = cleaned.split(".").filter(Boolean);
  if (segments.length === 0) return "Workspace User";
  return segments
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
}

export async function findUserByIdentifier(db: Db, identifierInput: string) {
  const users = db.collection<UserDocument>("users");
  const identifier = normalizeEmail(identifierInput);
  const handle = normalizeHandle(identifierInput);
  return users.findOne({ $or: [{ email: identifier }, { handle }] });
}

export async function authenticateUser(db: Db, identifierInput: string, password: string) {
  const users = db.collection<UserDocument>("users");
  const identifier = normalizeEmail(identifierInput);
  const handle = normalizeHandle(identifierInput);
  const user = await users.findOne({ $or: [{ email: identifier }, { handle }] });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error("Invalid Knox ID or password.");
  }

  return user;
}

export async function createSession(db: Db, userId: string, workspaceId?: string) {
  const sessions = db.collection<SessionDocument>("sessions");
  const token = issueSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);

  await sessions.insertOne({
    _id: crypto.randomUUID(),
    tokenHash: hashSessionToken(token),
    userId,
    workspaceId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  return {
    token,
    expiresAt,
  };
}

export async function destroySession(db: Db, token: string | undefined) {
  if (!token) return;
  await db.collection<SessionDocument>("sessions").deleteOne({ tokenHash: hashSessionToken(token) });
}

export async function getAuthContextFromToken(db: Db, token: string | undefined, workspaceId?: string): Promise<AuthContext | null> {
  if (!token) return null;

  await collectionDeleteExpired(db, "sessions");
  const sessions = db.collection<SessionDocument>("sessions");
  const users = db.collection<UserDocument>("users");
  const session = await sessions.findOne({ tokenHash: hashSessionToken(token) });
  if (!session) return null;

  const user = await users.findOne({ _id: session.userId });
  const membership = user
    ? await resolveWorkspaceMembership(db, user._id, workspaceId, session.workspaceId)
    : null;
  if (!user || !membership) return null;

  if (session.workspaceId !== membership.workspaceId) {
    await sessions.updateOne({ _id: session._id }, { $set: { workspaceId: membership.workspaceId } });
  }

  return {
    user,
    membership,
    workspaceId: membership.workspaceId,
    currentUser: buildCurrentUser(user, membership),
    permissions: getRolePermissions(membership.role),
  };
}

export async function listWorkspaceMembers(db: Db, workspaceId = WORKSPACE_ID): Promise<WorkspaceMember[]> {
  const users = await db.collection<UserDocument>("users").find({}).toArray();
  const memberships = await db.collection<MembershipDocument>("memberships").find({ workspaceId }).toArray();
  const userMap = new Map(users.map((user) => [user._id, user]));

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
        role: membership.role,
        emailVerified: user.emailVerified,
        mfaEnabled: user.mfaEnabled,
        joinedAt: membership.joinedAt,
      } satisfies WorkspaceMember;
    })
    .filter((member): member is WorkspaceMember => Boolean(member))
    .sort((left, right) => {
      if (left.role === right.role) return left.name.localeCompare(right.name);
      const rank = { owner: 0, editor: 1, viewer: 2 } satisfies Record<MemberRole, number>;
      return rank[left.role] - rank[right.role];
    });
}

export async function updateMemberRole(db: Db, workspaceId: string, userId: string, role: MemberRole) {
  if (workspaceId === WORKSPACE_ID) {
    throw new Error("VisualAI-Guest keeps every member as owner.");
  }
  await db.collection<MembershipDocument>("memberships").updateOne(
    { _id: `${workspaceId}:${userId}` },
    { $set: { role } },
    { upsert: false },
  );
}

export async function updateUserProfile(db: Db, userId: string, input: { name: string; handle: string; color: string }) {
  const users = db.collection<UserDocument>("users");
  const normalizedHandle = normalizeHandle(input.handle);
  const existing = await users.findOne({ handle: normalizedHandle, _id: { $ne: userId } });
  if (existing) {
    throw new Error("Handle is already taken.");
  }

  await users.updateOne(
    { _id: userId },
    {
      $set: {
        name: input.name.trim(),
        handle: normalizedHandle,
        color: input.color,
      },
    },
  );
}

export async function listUserWorkspaces(db: Db, userId: string): Promise<WorkspaceSummary[]> {
  const [records, memberships, pendingRequests] = await Promise.all([
    db.collection<WorkspaceRecordDocument>("workspace_records").find({}).toArray(),
    db.collection<MembershipDocument>("memberships").find({ userId }).toArray(),
    db.collection<WorkspaceJoinRequestDocument>("workspace_join_requests").find({ requesterUserId: userId, status: "pending" }).toArray(),
  ]);
  const membershipMap = new Map(memberships.map((membership) => [membership.workspaceId, membership]));
  const pendingSet = new Set(pendingRequests.map((request) => request.workspaceId));

  return records
    .map((record) => {
      const membership = membershipMap.get(record.id);
      return {
        id: record.id,
        name: record.name,
        workspaceKey: record.workspaceKey,
        ownerUserId: record.ownerUserId,
        role: membership?.role,
        joinedAt: membership?.joinedAt,
        pendingRequest: pendingSet.has(record.id),
        createdAt: record.createdAt,
      } satisfies WorkspaceSummary;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function getPreferredWorkspaceIdForUser(db: Db, userId: string) {
  const memberships = await db.collection<MembershipDocument>("memberships").find({ userId }).sort({ joinedAt: 1 }).toArray();
  return memberships[0]?.workspaceId ?? DEFAULT_WORKSPACE_ID;
}

export async function createWorkspaceForUser(db: Db, auth: AuthContext, input: { name?: string; description?: string }) {
  const name = normalizeWorkspaceName(input.name ?? "");
  let id = slugifyWorkspace(name);
  let counter = 1;
  while (await db.collection<WorkspaceRecordDocument>("workspace_records").findOne({ _id: id })) {
    counter += 1;
    id = `${slugifyWorkspace(name)}-${counter}`;
  }
  const now = new Date().toISOString();
  const workspaceKey = await buildUniqueWorkspaceKey(db, name);
  await ensureWorkspaceRecord(db, {
    _id: id,
    id,
    name,
    workspaceKey,
    description: input.description?.trim() || `Workspace for ${name}`,
    ownerUserId: auth.user._id,
    createdAt: now,
  });
  await db.collection<MembershipDocument>("memberships").updateOne(
    { _id: `${id}:${auth.user._id}` },
    {
      $setOnInsert: {
        workspaceId: id,
        userId: auth.user._id,
        role: "owner",
        joinedAt: now,
      },
    },
    { upsert: true },
  );
  await appendAuditLog(db, {
    actorName: auth.user.name,
    actorEmail: auth.user.email,
    actorUserId: auth.user._id,
    scope: "workspace",
    action: "create-workspace",
    detail: `${auth.user.email} created workspace ${name}.`,
  });
  return { id, name };
}

export async function createWorkspaceJoinRequest(db: Db, auth: AuthContext, input: { workspaceId: string; message?: string }) {
  const workspace = await db.collection<WorkspaceRecordDocument>("workspace_records").findOne({ _id: input.workspaceId });
  if (!workspace) throw new Error("Workspace not found.");
  if (!workspace.ownerUserId) throw new Error("Workspace owner is unavailable.");
  const membership = await db.collection<MembershipDocument>("memberships").findOne({ _id: `${input.workspaceId}:${auth.user._id}` });
  if (membership) throw new Error("Already a member of this workspace.");
  const existing = await db.collection<WorkspaceJoinRequestDocument>("workspace_join_requests").findOne({
    workspaceId: input.workspaceId,
    requesterUserId: auth.user._id,
    status: "pending",
  });
  if (existing) throw new Error("Join request is already pending.");

  const requestId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.collection<WorkspaceJoinRequestDocument>("workspace_join_requests").insertOne({
    _id: requestId,
    workspaceId: input.workspaceId,
    requesterUserId: auth.user._id,
    status: "pending",
    message: input.message?.trim() || "",
    createdAt: now,
    resolvedAt: null,
    resolvedByUserId: null,
  });
  await db.collection<NotificationDocument>("notifications").insertOne({
    _id: crypto.randomUUID(),
    id: crypto.randomUUID(),
    userId: workspace.ownerUserId,
    type: "workspace-join-request",
    title: `${auth.user.name} requested access`,
    body: `${auth.user.name} wants to join ${workspace.name}.`,
    workspaceId: workspace.id,
    readAt: null,
    createdAt: now,
    payload: { requestId, workspaceId: workspace.id, requesterUserId: auth.user._id },
  });
}

export async function listPendingJoinRequests(db: Db, workspaceId: string): Promise<WorkspaceJoinRequest[]> {
  const [requests, workspace, users] = await Promise.all([
    db.collection<WorkspaceJoinRequestDocument>("workspace_join_requests").find({ workspaceId, status: "pending" }).sort({ createdAt: -1 }).toArray(),
    db.collection<WorkspaceRecordDocument>("workspace_records").findOne({ _id: workspaceId }),
    db.collection<UserDocument>("users").find({}).toArray(),
  ]);
  const userMap = new Map(users.map((user) => [user._id, user]));
  return requests.map((request) => {
    const requester = userMap.get(request.requesterUserId);
    return {
      id: request._id,
      workspaceId,
      workspaceName: workspace?.name ?? workspaceId,
      requesterUserId: request.requesterUserId,
      requesterName: requester?.name ?? "Unknown",
      requesterEmail: requester?.email ?? "",
      status: request.status,
      message: request.message,
      createdAt: request.createdAt,
    };
  });
}

export async function approveJoinRequest(db: Db, auth: AuthContext, input: { requestId: string; approved: boolean }) {
  const requests = db.collection<WorkspaceJoinRequestDocument>("workspace_join_requests");
  const request = await requests.findOne({ _id: input.requestId, workspaceId: auth.workspaceId, status: "pending" });
  if (!request) throw new Error("Join request not found.");
  const workspace = await db.collection<WorkspaceRecordDocument>("workspace_records").findOne({ _id: auth.workspaceId });
  if (!workspace || workspace.ownerUserId !== auth.user._id) throw new Error("Only the workspace owner can review join requests.");

  const now = new Date().toISOString();
  await requests.updateOne({ _id: request._id }, { $set: { status: input.approved ? "approved" : "rejected", resolvedAt: now, resolvedByUserId: auth.user._id } });
  if (input.approved) {
    await db.collection<MembershipDocument>("memberships").updateOne(
      { _id: `${auth.workspaceId}:${request.requesterUserId}` },
      {
        $setOnInsert: {
          workspaceId: auth.workspaceId,
          userId: request.requesterUserId,
          role: "viewer",
          joinedAt: now,
        },
      },
      { upsert: true },
    );
  }
  await db.collection<NotificationDocument>("notifications").insertOne({
    _id: crypto.randomUUID(),
    id: crypto.randomUUID(),
    userId: request.requesterUserId,
    type: "workspace-join-approved",
    title: input.approved ? "Workspace request approved" : "Workspace request declined",
    body: input.approved ? `${workspace.name} access was approved.` : `${workspace.name} access was declined.`,
    workspaceId: auth.workspaceId,
    readAt: null,
    createdAt: now,
    payload: { workspaceId: auth.workspaceId, approved: String(input.approved) },
  });
}

export async function deleteWorkspaceForOwner(db: Db, auth: AuthContext, workspaceId: string) {
  if (workspaceId === WORKSPACE_ID) throw new Error("VisualAI-Guest cannot be deleted.");
  const workspace = await db.collection<WorkspaceRecordDocument>("workspace_records").findOne({ _id: workspaceId });
  if (!workspace || workspace.ownerUserId !== auth.user._id) throw new Error("Only the owner can delete this workspace.");
  await Promise.all([
    db.collection<WorkspaceRecordDocument>("workspace_records").deleteOne({ _id: workspaceId }),
    db.collection<{ _id: string }>("workspaces").deleteOne({ _id: workspaceId }),
    db.collection<MembershipDocument>("memberships").deleteMany({ workspaceId }),
    db.collection<WorkspaceJoinRequestDocument>("workspace_join_requests").deleteMany({ workspaceId }),
    db.collection<NotificationDocument>("notifications").deleteMany({ workspaceId }),
  ]);
}

export async function listNotifications(db: Db, auth: AuthContext) {
  return db.collection<NotificationDocument>("notifications").find({ userId: auth.user._id }).sort({ createdAt: -1 }).limit(50).toArray();
}

export async function markNotificationRead(db: Db, auth: AuthContext, notificationId: string) {
  await db.collection<NotificationDocument>("notifications").updateOne(
    { $or: [{ _id: notificationId }, { id: notificationId }], userId: auth.user._id },
    { $set: { readAt: new Date().toISOString() } },
  );
}

export async function sendDirectTechMessage(db: Db, auth: AuthContext, input: { targetUserId: string; body: string }) {
  const target = await db.collection<UserDocument>("users").findOne({ _id: input.targetUserId });
  if (!target) throw new Error("Target user not found.");
  await db.collection<NotificationDocument>("notifications").insertOne({
    _id: crypto.randomUUID(),
    id: crypto.randomUUID(),
    userId: input.targetUserId,
    type: "direct-tech-message",
    title: `Message from ${auth.user.name}`,
    body: input.body.trim(),
    workspaceId: auth.workspaceId,
    readAt: null,
    createdAt: new Date().toISOString(),
    payload: { fromUserId: auth.user._id },
  });
}

export async function createVerificationToken(db: Db, user: UserDocument) {
  const { rawToken, tokenHash } = issueTimedToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
  await db.collection<VerificationTokenDocument>("verification_tokens").insertOne({
    _id: crypto.randomUUID(),
    userId: user._id,
    tokenHash,
    createdAt: new Date().toISOString(),
    expiresAt,
    usedAt: null,
  });
  return rawToken;
}

export async function verifyEmailByToken(db: Db, rawToken: string) {
  await collectionDeleteExpired(db, "verification_tokens");
  const tokenHash = hashSessionToken(rawToken);
  const token = await db.collection<VerificationTokenDocument>("verification_tokens").findOne({ tokenHash, usedAt: null });
  if (!token) {
    throw new Error("Verification link is invalid or expired.");
  }

  await db.collection<UserDocument>("users").updateOne({ _id: token.userId }, { $set: { emailVerified: true } });
  await db.collection<VerificationTokenDocument>("verification_tokens").updateOne({ _id: token._id }, { $set: { usedAt: new Date().toISOString() } });
  const user = await db.collection<UserDocument>("users").findOne({ _id: token.userId });
  if (user) {
    await appendAuditLog(db, {
      actorName: user.name,
      actorEmail: user.email,
      actorUserId: user._id,
      userId: user._id,
      scope: "auth",
      action: "verify-email",
      detail: `${user.email} verified their email address.`,
    });
  }
}

export async function createInvite(db: Db, actor: AuthContext, input: { email: string; role: MemberRole }) {
  const { rawToken, tokenHash } = issueTimedToken();
  const email = normalizeEmail(input.email);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  await db.collection<InviteDocument>("invites").insertOne({
    _id: crypto.randomUUID(),
    email,
    role: input.role,
    tokenHash,
    invitedByUserId: actor.user._id,
    invitedByName: actor.user.name,
    createdAt: new Date().toISOString(),
    expiresAt,
    acceptedAt: null,
  });

  await appendAuditLog(db, {
    actorName: actor.user.name,
    actorEmail: actor.user.email,
    actorUserId: actor.user._id,
    scope: "security",
    action: "invite",
    detail: `${actor.user.email} invited ${email} as ${input.role}.`,
  });

  return `/?inviteToken=${rawToken}`;
}

export async function acceptInvite(db: Db, input: { token: string; name: string; handle: string; password: string }) {
  await collectionDeleteExpired(db, "invites");
  const tokenHash = hashSessionToken(input.token);
  const invite = await db.collection<InviteDocument>("invites").findOne({ tokenHash, acceptedAt: null });
  if (!invite) {
    throw new Error("Invite link is invalid or expired.");
  }

  const user = await registerUser(db, {
    email: invite.email,
    password: input.password,
    name: input.name,
    handle: input.handle,
    role: invite.role,
    emailVerified: true,
  });

  await db.collection<InviteDocument>("invites").updateOne({ _id: invite._id }, { $set: { acceptedAt: new Date().toISOString() } });
  await appendAuditLog(db, {
    actorName: user.name,
    actorEmail: user.email,
    actorUserId: user._id,
    userId: user._id,
    scope: "auth",
    action: "accept-invite",
    detail: `${user.email} accepted an invite as ${invite.role}.`,
  });
  return user;
}

export async function createPasswordResetToken(db: Db, emailInput: string) {
  const users = db.collection<UserDocument>("users");
  const email = normalizeEmail(emailInput);
  const user = await users.findOne({ email });
  if (!user) return null;

  const { rawToken, tokenHash } = issueTimedToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
  await db.collection<PasswordResetTokenDocument>("password_reset_tokens").insertOne({
    _id: crypto.randomUUID(),
    userId: user._id,
    tokenHash,
    createdAt: new Date().toISOString(),
    expiresAt,
    usedAt: null,
  });
  return rawToken;
}

export async function resetPasswordByToken(db: Db, rawToken: string, password: string) {
  await collectionDeleteExpired(db, "password_reset_tokens");
  const tokenHash = hashSessionToken(rawToken);
  const token = await db.collection<PasswordResetTokenDocument>("password_reset_tokens").findOne({ tokenHash, usedAt: null });
  if (!token) throw new Error("Password reset link is invalid or expired.");

  await db.collection<UserDocument>("users").updateOne(
    { _id: token.userId },
    { $set: { passwordHash: makePasswordHash(password) } },
  );
  await db.collection<PasswordResetTokenDocument>("password_reset_tokens").updateOne(
    { _id: token._id },
    { $set: { usedAt: new Date().toISOString() } },
  );

  const user = await db.collection<UserDocument>("users").findOne({ _id: token.userId });
  if (user) {
    await appendAuditLog(db, {
      actorName: user.name,
      actorEmail: user.email,
      actorUserId: user._id,
      userId: user._id,
      scope: "security",
      action: "reset-password",
      detail: `${user.email} reset their password.`,
    });
  }
}

export async function resetPasswordByIdentifier(db: Db, identifierInput: string, password = "0000") {
  const user = await findUserByIdentifier(db, identifierInput);
  if (!user) throw new Error("Knox ID not found.");

  await db.collection<UserDocument>("users").updateOne(
    { _id: user._id },
    { $set: { passwordHash: makePasswordHash(password) } },
  );

  await appendAuditLog(db, {
    actorName: user.name,
    actorEmail: user.email,
    actorUserId: user._id,
    userId: user._id,
    scope: "security",
    action: "reset-password",
    detail: `${user.email} password was reset to the default value.`,
  });
}

export async function createMfaSetup(db: Db, auth: AuthContext) {
  const secret = generateTotpSecret();
  await db.collection<UserDocument>("users").updateOne(
    { _id: auth.user._id },
    { $set: { pendingMfaSecret: secret } },
  );
  return {
    secret,
    otpAuthUrl: buildOtpAuthUrl({ secret, email: auth.user.email, issuer: APP_ISSUER }),
  };
}

export async function enableMfa(db: Db, auth: AuthContext, code: string) {
  const user = await db.collection<UserDocument>("users").findOne({ _id: auth.user._id });
  if (!user?.pendingMfaSecret) throw new Error("MFA setup was not started.");
  if (!verifyTotpCode(user.pendingMfaSecret, code)) throw new Error("Invalid MFA code.");

  await db.collection<UserDocument>("users").updateOne(
    { _id: user._id },
    { $set: { mfaSecret: user.pendingMfaSecret, mfaEnabled: true }, $unset: { pendingMfaSecret: "" } },
  );
  await appendAuditLog(db, {
    actorName: user.name,
    actorEmail: user.email,
    actorUserId: user._id,
    userId: user._id,
    scope: "security",
    action: "enable-mfa",
    detail: `${user.email} enabled MFA.`,
  });
}

export async function disableMfa(db: Db, auth: AuthContext, code: string) {
  const user = await db.collection<UserDocument>("users").findOne({ _id: auth.user._id });
  if (!user?.mfaSecret || !user.mfaEnabled) throw new Error("MFA is not enabled.");
  if (!verifyTotpCode(user.mfaSecret, code)) throw new Error("Invalid MFA code.");

  await db.collection<UserDocument>("users").updateOne(
    { _id: user._id },
    { $set: { mfaEnabled: false }, $unset: { mfaSecret: "", pendingMfaSecret: "" } },
  );
  await appendAuditLog(db, {
    actorName: user.name,
    actorEmail: user.email,
    actorUserId: user._id,
    userId: user._id,
    scope: "security",
    action: "disable-mfa",
    detail: `${user.email} disabled MFA.`,
  });
}

export async function createMfaChallenge(db: Db, user: UserDocument) {
  const { rawToken, tokenHash } = issueTimedToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 5).toISOString();
  await db.collection<MfaChallengeDocument>("mfa_challenges").insertOne({
    _id: crypto.randomUUID(),
    userId: user._id,
    tokenHash,
    createdAt: new Date().toISOString(),
    expiresAt,
  });
  return rawToken;
}

export async function consumeMfaChallenge(db: Db, challengeToken: string, code: string) {
  await collectionDeleteExpired(db, "mfa_challenges");
  const tokenHash = hashSessionToken(challengeToken);
  const challenge = await db.collection<MfaChallengeDocument>("mfa_challenges").findOne({ tokenHash });
  if (!challenge) throw new Error("MFA challenge expired.");

  const user = await db.collection<UserDocument>("users").findOne({ _id: challenge.userId });
  if (!user?.mfaSecret || !user.mfaEnabled) throw new Error("MFA is not enabled for this account.");
  if (!verifyTotpCode(user.mfaSecret, code)) throw new Error("Invalid MFA code.");

  await db.collection<MfaChallengeDocument>("mfa_challenges").deleteOne({ _id: challenge._id });
  return user;
}
