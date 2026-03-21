"use client";

import {
  CalendarDays,
  CircleDot,
  Command,
  Inbox,
  LayoutDashboard,
  ListTodo,
  PanelsTopLeft,
  Rocket,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createEventDraft,
  createTaskDraft,
  statusMeta,
  STATUS_ORDER,
  VIEWS,
} from "@/components/workspace/config";
import { EmptyStateCard, getInitials } from "@/components/workspace/shared";
import {
  AuditDialog,
  AuthScreen,
  AutomationDialog,
  EventDialog,
  InsightsDialog,
  LoadingScreen,
  MembersDialog,
  ProfileDialog,
  SavedViewsDialog,
  TaskCreateDialog,
  TaskDetailDialog,
  type TaskDetailDraft,
} from "@/components/workspace/surfaces";
import { filterAndSortTasks, filterTasks } from "@/components/workspace/task-utils";
import { useWorkspaceQueryState } from "@/components/workspace/use-workspace-query-state";
import {
  CollaborateView,
  HomeView,
  InboxView,
  type InboxEntry,
  type InboxFilter,
  MyWorkView,
  ProjectsView,
  type ProjectsTab,
  CalendarView,
  WorkspaceHubView,
} from "@/components/workspace/views";
import { useWorkspaceRealtime } from "@/components/workspace/hooks/use-workspace-realtime";
import { useWorkspaceSession } from "@/components/workspace/hooks/use-workspace-session";
import {
  addDays,
  buildMonthGrid,
  formatDateTimeLocal,
  isSameDay,
  parseDate,
} from "@/lib/date-utils";
import type {
  AgendaEvent,
  AnalyticsSummary,
  AuditLogItem,
  EventDraft,
  MemberRole,
  SavedView,
  TaskDraft,
  TaskItem,
  TaskStatus,
  WhiteboardNote,
  WhiteboardScene,
} from "@/lib/types";
import { cn } from "@/lib/utils";

async function readJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

interface WorkspaceCatalogItem {
  id: string;
  name: string;
  workspaceKey?: string;
  role: MemberRole;
  memberCount?: number;
  pendingRequestCount?: number;
  joinRequested?: boolean;
  isActive?: boolean;
}

interface WorkspaceJoinRequestItem {
  id: string;
  workspaceId: string;
  workspaceName: string;
  requesterName: string;
  requesterEmail?: string;
  requestedAt: string;
}

interface WorkspaceNotificationItem {
  id: string;
  type: "workspace-request" | "message";
  title: string;
  detail: string;
  workspaceId?: string;
  requestId?: string;
  unread?: boolean;
  createdAt?: string;
}

interface SurfaceNotice {
  message: string;
  tone: "success" | "error";
}

function computeAnalytics(tasks: TaskItem[], notes: WhiteboardNote[], events: AgendaEvent[], automationRuns = 0): AnalyticsSummary {
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const overdueTasks = tasks.filter((task) => task.status !== "done" && new Date(`${task.dueDate}T23:59:59`).getTime() < now).length;
  const dueSoonTasks = tasks.filter((task) => task.status !== "done" && new Date(`${task.dueDate}T23:59:59`).getTime() <= now + 3 * 24 * 60 * 60 * 1000 && new Date(`${task.dueDate}T23:59:59`).getTime() >= now).length;
  const blockedTasks = tasks.filter((task) => task.blocked).length;
  const reviewTasks = tasks.filter((task) => task.status === "review").length;
  const completionRate = tasks.length ? Math.round((tasks.filter((task) => task.status === "done").length / tasks.length) * 100) : 0;
  const eventsToday = events.filter((event) => {
    const start = parseDate(event.start);
    return start >= today && start <= end;
  }).length;
  const decisionNotes = notes.filter((note) => note.section === "decisions").length;
  const convertedNotes = notes.filter((note) => Boolean(note.linkedTaskId)).length;
  return { overdueTasks, dueSoonTasks, blockedTasks, reviewTasks, completionRate, eventsToday, decisionNotes, convertedNotes, automationRuns };
}

function expandRecurringEvents(events: AgendaEvent[]) {
  const expanded: AgendaEvent[] = [];
  for (const event of events) {
    expanded.push(event);
    const recurrence = event.recurrence;
    if (!recurrence || recurrence === "none") continue;
    const start = parseDate(event.start);
    const end = parseDate(event.end);
    const durationMs = end.getTime() - start.getTime();
    const step = recurrence.includes("DAILY") ? 1 : recurrence.includes("WEEKLY") ? 7 : recurrence.includes("MONTHLY") ? 30 : 0;
    if (!step) continue;
    for (let index = 1; index <= 6; index += 1) {
      const nextStart = addDays(start, step * index);
      const nextEnd = new Date(nextStart.getTime() + durationMs);
      expanded.push({ ...event, id: `${event.id}-${formatDateTimeLocal(nextStart)}`, start: nextStart.toISOString(), end: nextEnd.toISOString() });
    }
  }
  return expanded;
}

export function WorkspaceApp() {
  const {
    view,
    setView,
    calendarViewMode,
    setCalendarViewMode,
    ganttZoom,
    setGanttZoom,
    search,
    setSearch,
    selectedDay,
    setSelectedDay,
    statusFilter,
    priorityFilter,
    sortMode,
    serialize,
    applySerialized,
  } = useWorkspaceQueryState();
  const {
    snapshot,
    setSnapshot,
    loading,
    authRequired,
    authMode,
    setAuthMode,
    authForm,
    setAuthForm,
    authError,
    setAuthError,
    authInfo,
    setAuthInfo,
    authBusy,
    inviteToken,
    resetToken,
    mfaChallengeToken,
    mfaCode,
    setMfaCode,
    forgotEmail,
    setForgotEmail,
    resetPassword,
    setResetPassword,
    deviceIdRef,
    connectedAtRef,
    loadBootstrap,
    performAuth,
    logout: logoutSession,
    requestPasswordReset,
    confirmPasswordReset,
  } = useWorkspaceSession({ setSelectedDay });
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [savedViewsOpen, setSavedViewsOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [taskCommentDraft, setTaskCommentDraft] = useState("");
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [taskDetailDraft, setTaskDetailDraft] = useState<TaskDetailDraft | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(createTaskDraft());
  const [eventDraft, setEventDraft] = useState<EventDraft>(createEventDraft(new Date()));
  const [whiteboardScene, setWhiteboardScene] = useState<WhiteboardScene>({ elements: [], appState: {}, files: {}, version: 0, updatedAt: new Date().toISOString() });
  const [profileDraft, setProfileDraft] = useState({ name: "", handle: "", color: "#2b4bb9" });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("viewer");
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpAuthUrl: string } | null>(null);
  const [mfaManageCode, setMfaManageCode] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspaceHubOpen, setWorkspaceHubOpen] = useState(false);
  const [workspaceCatalog, setWorkspaceCatalog] = useState<WorkspaceCatalogItem[]>([]);
  const [workspaceJoinRequests, setWorkspaceJoinRequests] = useState<WorkspaceJoinRequestItem[]>([]);
  const [notifications, setNotifications] = useState<WorkspaceNotificationItem[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [workspaceCreateName, setWorkspaceCreateName] = useState(`VisualAI-Guest-${Math.random().toString(36).slice(2, 6)}`);
  const [workspaceJoinValue, setWorkspaceJoinValue] = useState("");
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [ganttGranularity, setGanttGranularity] = useState<"day" | "week" | "month">("week");
  const [ganttRangeDays, setGanttRangeDays] = useState(120);
  const [projectsTab, setProjectsTab] = useState<ProjectsTab>("board");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [surfaceNotice, setSurfaceNotice] = useState<SurfaceNotice | null>(null);

  const { connectionState, emitAck, disconnect } = useWorkspaceRealtime({
    authenticated: Boolean(snapshot?.authenticated),
    view,
    deviceIdRef,
    connectedAtRef,
    loadBootstrap,
    onWorkspaceSnapshot: (workspace) => setSnapshot((current) => (current ? { ...current, workspace } : current)),
    onPresenceList: (presence) => setSnapshot((current) => (current ? { ...current, presence } : current)),
    onMembersList: (members) => setSnapshot((current) => (current ? { ...current, members } : current)),
    onAuthUser: (currentUser) => {
      setSnapshot((current) => (current ? { ...current, currentUser } : current));
      setProfileDraft({ name: currentUser.name, handle: currentUser.handle, color: currentUser.color });
    },
  });

  const workspace = snapshot?.workspace ?? null;
  const uniquePresence = useMemo(
    () => Array.from(new Map((snapshot?.presence ?? []).map((member) => [member.userId, member])).values()),
    [snapshot?.presence],
  );
  const members = useMemo(() => snapshot?.members ?? [], [snapshot?.members]);
  const userDirectory = useMemo(() => snapshot?.userDirectory ?? [], [snapshot?.userDirectory]);
  const currentUser = snapshot?.currentUser ?? null;
  const permissions = snapshot?.permissions ?? null;
  const selectedTask = selectedTaskId && workspace ? workspace.tasks.find((task) => task.id === selectedTaskId) ?? null : null;

  useEffect(() => {
    if (!surfaceNotice) return;
    const timer = window.setTimeout(() => setSurfaceNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [surfaceNotice]);

  const reportError = useCallback((error: unknown, fallback: string) => {
    console.error(error);
    setSurfaceNotice({ message: error instanceof Error ? error.message : fallback, tone: "error" });
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    setProfileDraft({ name: currentUser.name, handle: currentUser.handle, color: currentUser.color });
  }, [currentUser]);

  const loadWorkspaceShellData = useCallback(async () => {
    if (!snapshot?.authenticated || !workspace) return;
    try {
      const [workspacesResponse, notificationsResponse] = await Promise.all([
        fetch("/api/workspaces", { cache: "no-store" }),
        fetch("/api/notifications", { cache: "no-store" }),
      ]);

      if (workspacesResponse.ok) {
        const payload = await readJsonSafe(workspacesResponse);
        setWorkspaceCatalog(
          (payload?.workspaces as WorkspaceCatalogItem[] | undefined) ?? [
            {
              id: workspace.id,
              name: workspace.name,
              workspaceKey: workspace.workspaceKey,
              role: currentUser?.role ?? "viewer",
              memberCount: members.length,
              isActive: true,
            },
          ],
        );
        setWorkspaceJoinRequests((payload?.requests as WorkspaceJoinRequestItem[] | undefined) ?? []);
      } else {
        setWorkspaceCatalog([
          {
            id: workspace.id,
            name: workspace.name,
            workspaceKey: workspace.workspaceKey,
            role: currentUser?.role ?? "viewer",
            memberCount: members.length,
            isActive: true,
          },
        ]);
        setWorkspaceJoinRequests([]);
      }

      if (notificationsResponse.ok) {
        const payload = await readJsonSafe(notificationsResponse);
        setNotifications((payload?.notifications as WorkspaceNotificationItem[] | undefined) ?? []);
      } else {
        setNotifications([]);
      }
    } catch {
      setWorkspaceCatalog([
        {
          id: workspace.id,
          name: workspace.name,
          workspaceKey: workspace.workspaceKey,
          role: currentUser?.role ?? "viewer",
          memberCount: members.length,
          isActive: true,
        },
      ]);
      setWorkspaceJoinRequests([]);
      setNotifications([]);
    }
  }, [currentUser?.role, members.length, snapshot?.authenticated, workspace]);

  useEffect(() => {
    void loadWorkspaceShellData();
  }, [loadWorkspaceShellData]);

  useEffect(() => {
    if (workspace?.whiteboardScene && Array.isArray(workspace.whiteboardScene.elements)) {
      setWhiteboardScene(workspace.whiteboardScene);
      return;
    }
    const stored = window.localStorage.getItem("newkanban.whiteboard-scene");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as WhiteboardScene;
      if (Array.isArray(parsed.elements)) setWhiteboardScene(parsed);
    } catch {
      // ignore malformed local cache
    }
  }, [workspace?.whiteboardScene]);

  useEffect(() => {
    window.localStorage.setItem("newkanban.whiteboard-scene", JSON.stringify(whiteboardScene));
  }, [whiteboardScene]);

  useEffect(() => {
    if (!selectedTask) return;
    const fallbackAssigneeId =
      currentUser?.userId ??
      members[0]?.userId ??
      userDirectory[0]?.userId ??
      "";
    const resolvedAssigneeId =
      selectedTask.assigneeUserId ??
      members.find((member) => member.name === selectedTask.assigneeName)?.userId ??
      userDirectory.find((member) => member.name === selectedTask.assigneeName || member.handle === selectedTask.assigneeName || member.email === selectedTask.assigneeName)?.userId ??
      fallbackAssigneeId;
    setTaskDetailDraft({
      title: selectedTask.title,
      description: selectedTask.description,
      status: selectedTask.status,
      priority: selectedTask.priority,
      startDate: selectedTask.startDate,
      dueDate: selectedTask.dueDate,
      progress: selectedTask.progress,
      assigneeUserId: resolvedAssigneeId,
    });
  }, [currentUser?.userId, members, selectedTask, userDirectory]);

  const filteredTasks = useMemo(() => {
    if (!workspace) return [];
    return filterAndSortTasks(workspace.tasks, { search, statusFilter, priorityFilter, sortMode });
  }, [priorityFilter, search, sortMode, statusFilter, workspace]);
  const projectTasks = useMemo(() => {
    if (!workspace) return [];
    return filterTasks(workspace.tasks, { search, statusFilter, priorityFilter });
  }, [priorityFilter, search, statusFilter, workspace]);

  const combinedEvents = useMemo(() => {
    const workspaceEvents = workspace?.agenda ?? [];
    const externalEvents = snapshot?.externalAgenda ?? [];
    return expandRecurringEvents([...workspaceEvents, ...externalEvents]).sort((left, right) => left.start.localeCompare(right.start));
  }, [snapshot?.externalAgenda, workspace?.agenda]);

  const analytics = useMemo(() => snapshot?.analytics ?? computeAnalytics(workspace?.tasks ?? [], workspace?.notes ?? [], combinedEvents, workspace?.automationRunsCount ?? 0), [combinedEvents, snapshot?.analytics, workspace]);

  const now = Date.now();
  const todayDate = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }, []);
  const currentUserTaskFilter = useCallback((task: TaskItem) => {
    if (!currentUser) return false;
    return task.assigneeUserId === currentUser.userId || task.assigneeName === currentUser.name;
  }, [currentUser]);

  const focusTasks = useMemo(() => filteredTasks.filter((task) => task.status === "progress" || task.status === "todo").slice(0, 4), [filteredTasks]);
  const waitingTasks = useMemo(() => filteredTasks.filter((task) => task.status === "review").slice(0, 4), [filteredTasks]);
  const myTasks = useMemo(() => filteredTasks.filter((task) => currentUserTaskFilter(task)), [currentUserTaskFilter, filteredTasks]);
  const myFocusTasks = useMemo(() => myTasks.filter((task) => task.status === "progress" || task.status === "todo").slice(0, 4), [myTasks]);
  const myDueTodayTasks = useMemo(() => myTasks.filter((task) => task.status !== "done" && isSameDay(parseDate(task.dueDate), todayDate)).slice(0, 4), [myTasks, todayDate]);
  const myWaitingTasks = useMemo(() => myTasks.filter((task) => task.status === "review").slice(0, 4), [myTasks]);
  const myRecentTasks = useMemo(() => [...myTasks].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 8), [myTasks]);
  const recentDecisionNotes = useMemo(() => [...(workspace?.notes ?? [])].filter((note) => note.section === "decisions" || note.section === "actions").sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 4), [workspace?.notes]);
  const upcomingEvents = useMemo(() => combinedEvents.filter((event) => parseDate(event.start).getTime() >= now).slice(0, 4), [combinedEvents, now]);

  const monthGrid = useMemo(() => buildMonthGrid(selectedDay), [selectedDay]);
  const savedViews = useMemo(() => workspace?.savedViews ?? snapshot?.savedViews ?? [], [snapshot?.savedViews, workspace?.savedViews]);
  const automationRules = workspace?.automationRules ?? [];

  const openTaskDetail = useCallback((task: TaskItem) => {
    setSelectedTaskId(task.id);
    setTaskCommentDraft("");
    setTaskDetailOpen(true);
  }, []);

  const openEventEditor = useCallback((event?: AgendaEvent, seedDay?: Date, relatedTaskId?: string) => {
    if (event) {
      setEditingEventId(event.id);
      setEventDraft({
        title: event.title,
        start: event.start.slice(0, 16),
        end: event.end.slice(0, 16),
        type: event.type,
        description: event.description ?? "",
        location: event.location ?? "",
        link: event.link ?? "",
        relatedTaskId: event.relatedTaskId ?? "",
        recurrence: event.recurrence === "daily" || event.recurrence === "weekly" || event.recurrence === "monthly" ? event.recurrence : "none",
      });
    } else {
      setEditingEventId(null);
      setEventDraft(createEventDraft(seedDay ?? selectedDay, relatedTaskId ?? ""));
    }
    setEventDialogOpen(true);
  }, [selectedDay]);

  const patchTaskLocally = useCallback((taskId: string, patch: Partial<TaskItem>) => {
    setSnapshot((current) => {
      if (!current?.workspace) return current;
      return {
        ...current,
        workspace: {
          ...current.workspace,
          tasks: current.workspace.tasks.map((task) => task.id === taskId ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task),
        },
      };
    });
  }, [setSnapshot]);

  const moveTaskLocally = useCallback((taskId: string, nextStatus: TaskStatus) => {
    setSnapshot((current) => {
      if (!current?.workspace) return current;
      const tasks = [...current.workspace.tasks];
      const taskIndex = tasks.findIndex((task) => task.id === taskId);
      if (taskIndex === -1) return current;
      const [task] = tasks.splice(taskIndex, 1);
      const movedTask: TaskItem = { ...task, status: nextStatus, progress: nextStatus === "done" ? 100 : Math.max(task.progress, STATUS_ORDER.indexOf(nextStatus) * 25), updatedAt: new Date().toISOString() };
      const insertIndex = tasks.findIndex((item) => item.status === nextStatus);
      if (insertIndex === -1) tasks.push(movedTask);
      else tasks.splice(insertIndex, 0, movedTask);
      return { ...current, workspace: { ...current.workspace, tasks } };
    });
  }, [setSnapshot]);

  const removeTaskLocally = useCallback((taskId: string) => {
    setSnapshot((current) => {
      if (!current?.workspace) return current;
      return {
        ...current,
        workspace: {
          ...current.workspace,
          tasks: current.workspace.tasks.filter((task) => task.id !== taskId),
          notes: current.workspace.notes.map((note) => note.linkedTaskId === taskId ? { ...note, linkedTaskId: null } : note),
          agenda: current.workspace.agenda.flatMap((event) => {
            if (event.relatedTaskId !== taskId) return [event];
            if (event.generatedByRule || event.source === "automation") return [];
            return [{ ...event, relatedTaskId: undefined }];
          }),
        },
      };
    });
  }, [setSnapshot]);

  const removeCommentLocally = useCallback((taskId: string, commentId: string) => {
    setSnapshot((current) => {
      if (!current?.workspace) return current;
      const nextTasks = current.workspace.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const commentIds = new Set([commentId]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const comment of task.comments) {
            if (comment.parentId && commentIds.has(comment.parentId) && !commentIds.has(comment.id)) {
              commentIds.add(comment.id);
              changed = true;
            }
          }
        }
        const comments = task.comments.filter((comment) => !commentIds.has(comment.id));
        return {
          ...task,
          comments,
          commentsCount: comments.length,
          updatedAt: new Date().toISOString(),
        };
      });
      return { ...current, workspace: { ...current.workspace, tasks: nextTasks } };
    });
  }, [setSnapshot]);

  const patchEventLocally = useCallback((eventId: string, patch: Partial<AgendaEvent>) => {
    setSnapshot((current) => {
      if (!current?.workspace) return current;
      return {
        ...current,
        workspace: {
          ...current.workspace,
          agenda: current.workspace.agenda.map((event) => event.id === eventId ? { ...event, ...patch } : event),
        },
      };
    });
  }, [setSnapshot]);

  const removeEventLocally = useCallback((eventId: string) => {
    setSnapshot((current) => {
      if (!current?.workspace) return current;
      return {
        ...current,
        workspace: {
          ...current.workspace,
          agenda: current.workspace.agenda.filter((event) => event.id !== eventId),
          tasks: current.workspace.tasks.map((task) => ({
            ...task,
            linkedEventIds: (task.linkedEventIds ?? []).filter((linkedId) => linkedId !== eventId),
          })),
        },
      };
    });
  }, [setSnapshot]);

  const logout = useCallback(async () => {
    disconnect();
    await logoutSession();
  }, [disconnect, logoutSession]);

  const beginMfaSetup = useCallback(async () => {
    const response = await fetch("/api/auth/mfa/setup", { method: "POST" });
    const payload = await readJsonSafe(response);
    if (!response.ok) {
      setAuthError(payload?.message ?? "Unable to start MFA setup.");
      return;
    }
    setMfaSetup({ secret: payload.secret, otpAuthUrl: payload.otpAuthUrl });
  }, [setAuthError]);

  const enableMfaForCurrentUser = useCallback(async () => {
    const response = await fetch("/api/auth/mfa/enable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: mfaManageCode }) });
    const payload = await readJsonSafe(response);
    if (!response.ok) {
      setAuthError(payload?.message ?? "Unable to enable MFA.");
      return;
    }
    setAuthInfo("MFA enabled.");
    setMfaSetup(null);
    setMfaManageCode("");
    await loadBootstrap();
  }, [loadBootstrap, mfaManageCode, setAuthError, setAuthInfo]);

  const disableMfaForCurrentUser = useCallback(async () => {
    const response = await fetch("/api/auth/mfa/disable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: mfaManageCode }) });
    const payload = await readJsonSafe(response);
    if (!response.ok) {
      setAuthError(payload?.message ?? "Unable to disable MFA.");
      return;
    }
    setAuthInfo("MFA disabled.");
    setMfaManageCode("");
    await loadBootstrap();
  }, [loadBootstrap, mfaManageCode, setAuthError, setAuthInfo]);

  const createInviteLink = useCallback(async () => {
    const response = await fetch("/api/invites/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail, role: inviteRole }) });
    const payload = await readJsonSafe(response);
    if (!response.ok) {
      setAuthError(payload?.message ?? "Unable to create invite.");
      return;
    }
    setGeneratedInviteLink(payload?.inviteLink ?? null);
    setInviteEmail("");
    await loadBootstrap();
  }, [inviteEmail, inviteRole, loadBootstrap, setAuthError]);

  const openAuditLog = useCallback(async () => {
    const response = await fetch("/api/audit", { cache: "no-store" });
    const payload = await readJsonSafe(response);
    setAuditLogs(payload?.auditLogs ?? []);
    setAuditDialogOpen(true);
  }, []);

  const saveProfile = useCallback(async () => {
    try {
      await emitAck("profile:update", profileDraft);
      setProfileDialogOpen(false);
    } catch (error) {
      console.error(error);
    }
  }, [emitAck, profileDraft]);

  const submitTask = useCallback(async () => {
    if (!permissions?.editWorkspace || !taskDraft.title.trim() || !taskDraft.description.trim()) return;
    try {
      await emitAck("task:create", taskDraft as unknown as Record<string, unknown>);
      setTaskDraft(createTaskDraft());
      setTaskDialogOpen(false);
    } catch (error) {
      console.error(error);
    }
  }, [emitAck, permissions?.editWorkspace, taskDraft]);

  const quickCreateTask = useCallback(async (status: TaskStatus, title: string) => {
    if (!permissions?.editWorkspace || !title.trim()) return;
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = addDays(new Date(), status === "review" ? 1 : 3).toISOString().slice(0, 10);
    try {
      await emitAck("task:create", { ...createTaskDraft(), title: title.trim(), description: `Quick added from ${statusMeta[status].label}.`, status, startDate: today, dueDate });
    } catch (error) {
      console.error(error);
    }
  }, [emitAck, permissions?.editWorkspace]);

  const inlineUpdateTask = useCallback(async (taskId: string, patch: Partial<TaskItem>) => {
    patchTaskLocally(taskId, patch);
    try {
      await emitAck("task:update", { taskId, ...patch });
    } catch (error) {
      console.error(error);
    }
  }, [emitAck, patchTaskLocally]);

  const submitEvent = useCallback(async () => {
    if (!permissions?.editCalendar || !eventDraft.title.trim()) return;
    try {
      if (editingEventId) {
        await emitAck("event:update", { eventId: editingEventId, ...eventDraft, recurrence: eventDraft.recurrence || "none", attendees: 4 });
      } else {
        await emitAck("event:create", { ...eventDraft, recurrence: eventDraft.recurrence || "none", attendees: 4 });
      }
      setEditingEventId(null);
      setEventDialogOpen(false);
    } catch (error) {
      console.error(error);
    }
  }, [editingEventId, emitAck, eventDraft, permissions?.editCalendar]);

  const deleteEvent = useCallback(async () => {
    if (!permissions?.editCalendar || !editingEventId) return;
    const eventLabel = eventDraft.title.trim() || "this event";
    if (!window.confirm(`Delete "${eventLabel}"? This cannot be undone.`)) return;
    setDeletingEventId(editingEventId);
    try {
      removeEventLocally(editingEventId);
      setEditingEventId(null);
      setEventDialogOpen(false);
      await emitAck("event:delete", { eventId: editingEventId });
    } catch (error) {
      await emitAck("workspace:sync", {});
      reportError(error, "Unable to delete event.");
    } finally {
      setDeletingEventId(null);
    }
  }, [editingEventId, emitAck, eventDraft.title, permissions?.editCalendar, removeEventLocally, reportError]);

  const saveTaskDetail = useCallback(async () => {
    if (!permissions?.editWorkspace || !selectedTaskId || !taskDetailDraft || !selectedTask) return;
    if (selectedTask.status !== taskDetailDraft.status) moveTaskLocally(selectedTaskId, taskDetailDraft.status);
    patchTaskLocally(selectedTaskId, taskDetailDraft);
    try {
      await emitAck("task:update", { taskId: selectedTaskId, ...taskDetailDraft });
      setTaskDetailOpen(false);
    } catch (error) {
      console.error(error);
    }
  }, [emitAck, moveTaskLocally, patchTaskLocally, permissions?.editWorkspace, selectedTask, selectedTaskId, taskDetailDraft]);

  const submitTaskComment = useCallback(async () => {
    if (!permissions?.comment || !selectedTaskId || !taskCommentDraft.trim()) return;
    try {
      await emitAck("task:comment", { taskId: selectedTaskId, body: taskCommentDraft.trim(), parentId: replyTargetId });
      setTaskCommentDraft("");
      setReplyTargetId(null);
    } catch (error) {
      console.error(error);
    }
  }, [emitAck, permissions?.comment, replyTargetId, selectedTaskId, taskCommentDraft]);

  const deleteTaskComment = useCallback(async (commentId: string) => {
    if (!permissions?.comment || !selectedTaskId) return;
    const deletedCommentIds = new Set([commentId]);
    for (let changed = true; changed && selectedTask; ) {
      changed = false;
      for (const comment of selectedTask.comments) {
        if (comment.parentId && deletedCommentIds.has(comment.parentId) && !deletedCommentIds.has(comment.id)) {
          deletedCommentIds.add(comment.id);
          changed = true;
        }
      }
    }
    setDeletingCommentId(commentId);
    try {
      removeCommentLocally(selectedTaskId, commentId);
      await emitAck("task:comment-delete", { taskId: selectedTaskId, commentId });
      if (replyTargetId && deletedCommentIds.has(replyTargetId)) setReplyTargetId(null);
    } catch (error) {
      await emitAck("workspace:sync", {});
      reportError(error, "Unable to delete update.");
    } finally {
      setDeletingCommentId(null);
    }
  }, [emitAck, permissions?.comment, removeCommentLocally, reportError, replyTargetId, selectedTask, selectedTaskId]);

  const uploadAttachment = useCallback(async (file: File) => {
    if (!permissions?.uploadFiles || !selectedTaskId) return;
    setUploadBusy(true);
    try {
      const formData = new FormData();
      formData.append("taskId", selectedTaskId);
      formData.append("file", file);
      const response = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!response.ok) {
        const payload = await readJsonSafe(response);
        throw new Error(payload?.message ?? "Upload failed.");
      }
      await emitAck("workspace:sync", {});
    } catch (error) {
      reportError(error, "Upload failed.");
    } finally {
      setUploadBusy(false);
    }
  }, [emitAck, permissions?.uploadFiles, reportError, selectedTaskId]);

  const deleteAttachment = useCallback(async (attachmentId: string) => {
    if (!permissions?.uploadFiles || !selectedTaskId) return;
    setDeletingAttachmentId(attachmentId);
    try {
      const response = await fetch("/api/uploads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: selectedTaskId, attachmentId }),
      });
      if (!response.ok) {
        const payload = await readJsonSafe(response);
        throw new Error(payload?.message ?? "Unable to delete file.");
      }
      await emitAck("workspace:sync", {});
    } catch (error) {
      reportError(error, "Unable to delete file.");
    } finally {
      setDeletingAttachmentId(null);
    }
  }, [emitAck, permissions?.uploadFiles, reportError, selectedTaskId]);

  const deleteTask = useCallback(async () => {
    if (!permissions?.editWorkspace || !selectedTaskId || !selectedTask) return;
    if (!window.confirm(`Delete "${selectedTask.title}"? This cannot be undone.`)) return;
    setDeletingTaskId(selectedTaskId);
    try {
      removeTaskLocally(selectedTaskId);
      setTaskDetailOpen(false);
      setSelectedTaskId(null);
      setReplyTargetId(null);
      setTaskCommentDraft("");
      await emitAck("task:delete", { taskId: selectedTaskId });
    } catch (error) {
      await emitAck("workspace:sync", {});
      reportError(error, "Unable to delete task.");
    } finally {
      setDeletingTaskId(null);
    }
  }, [emitAck, permissions?.editWorkspace, removeTaskLocally, reportError, selectedTask, selectedTaskId]);

  const dropTaskToStatus = useCallback(async (taskId: string, nextStatus: TaskStatus) => {
    if (!permissions?.editWorkspace) return;
    moveTaskLocally(taskId, nextStatus);
    try {
      await emitAck("task:update", { taskId, status: nextStatus });
    } catch (error) {
      console.error(error);
    }
  }, [emitAck, moveTaskLocally, permissions?.editWorkspace]);

  const moveEventWindow = useCallback(async (eventLike: AgendaEvent, nextStart: string, nextEnd: string) => {
    if (!permissions?.editCalendar) return;
    const existing = workspace?.agenda.find((event) => event.id === eventLike.id);
    if (!existing || existing.readonly) return;
    patchEventLocally(existing.id, { start: nextStart, end: nextEnd });
    try {
      await emitAck("event:update", { eventId: existing.id, start: nextStart, end: nextEnd });
    } catch (error) {
      console.error(error);
    }
  }, [emitAck, patchEventLocally, permissions?.editCalendar, workspace?.agenda]);

  const resizeEventWindow = useCallback(async (eventLike: AgendaEvent, nextEnd: string) => {
    if (!permissions?.editCalendar) return;
    const existing = workspace?.agenda.find((event) => event.id === eventLike.id);
    if (!existing || existing.readonly) return;
    patchEventLocally(existing.id, { end: nextEnd });
    try {
      await emitAck("event:update", { eventId: existing.id, end: nextEnd });
    } catch (error) {
      console.error(error);
    }
  }, [emitAck, patchEventLocally, permissions?.editCalendar, workspace?.agenda]);

  const updateTaskDates = useCallback(async (taskId: string, startDate: string, dueDate: string) => {
    if (!permissions?.editWorkspace) return;
    patchTaskLocally(taskId, { startDate, dueDate });
    try {
      await emitAck("task:update", { taskId, startDate, dueDate });
    } catch (error) {
      console.error(error);
    }
  }, [emitAck, patchTaskLocally, permissions?.editWorkspace]);

  const saveWhiteboardScene = useCallback(async (scene: WhiteboardScene, reason: "auto" | "manual" = "auto") => {
    setWhiteboardScene(scene);
    setSnapshot((current) => {
      if (!current?.workspace) return current;
      return {
        ...current,
        workspace: {
          ...current.workspace,
          whiteboardScene: scene,
        },
      };
    });
    try {
      await emitAck("whiteboard:save", scene as unknown as Record<string, unknown>);
      if (reason === "manual") setSurfaceNotice({ message: "Canvas saved.", tone: "success" });
    } catch (error) {
      reportError(error, "Unable to save canvas.");
    }
  }, [emitAck, reportError, setSnapshot]);

  const createSavedView = useCallback(async (name: string) => {
    try {
      await emitAck("saved-view:create", { name, ...serialize() });
    } catch (error) {
      console.error(error);
    }
  }, [emitAck, serialize]);

  const deleteSavedView = useCallback(async (savedViewId: string) => {
    try {
      await emitAck("saved-view:delete", { savedViewId });
    } catch (error) {
      console.error(error);
    }
  }, [emitAck]);

  const applySavedView = useCallback((savedView: SavedView) => {
    applySerialized({
      view: savedView.view,
      search: savedView.search,
      boardMode: savedView.boardMode,
      calendarViewMode: savedView.calendarViewMode,
      ganttZoom: savedView.ganttZoom ?? "balanced",
      statusFilter: savedView.statusFilter,
      priorityFilter: savedView.priorityFilter,
      sortMode: savedView.sortMode,
    });
    setSavedViewsOpen(false);
  }, [applySerialized]);

  const updateTaskDependencies = useCallback(async (taskId: string, dependencyIds: string[]) => {
    patchTaskLocally(taskId, { dependencyIds });
    try {
      await emitAck("task:update", { taskId, dependencyIds });
    } catch (error) {
      console.error(error);
    }
  }, [emitAck, patchTaskLocally]);

  const toggleAutomationRule = useCallback(async (ruleId: string, enabled: boolean) => {
    try {
      await emitAck("automation:toggle", { ruleId, enabled });
    } catch (error) {
      console.error(error);
    }
  }, [emitAck]);

  const createWorkspace = useCallback(async () => {
    if (!workspaceCreateName.trim()) return;
    setWorkspaceBusy(true);
    try {
      const response = await fetch("/api/workspaces/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceCreateName.trim() }),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to create workspace.");
      setWorkspaceCreateName(`VisualAI-Guest-${Math.random().toString(36).slice(2, 6)}`);
      setWorkspaceHubOpen(false);
      await loadBootstrap();
      await loadWorkspaceShellData();
    } catch (error) {
      console.error(error);
    } finally {
      setWorkspaceBusy(false);
    }
  }, [loadBootstrap, loadWorkspaceShellData, workspaceCreateName]);

  const requestWorkspaceJoin = useCallback(async () => {
    if (!workspaceJoinValue.trim()) return;
    setWorkspaceBusy(true);
    try {
      const response = await fetch("/api/workspaces/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceKey: workspaceJoinValue.trim() }),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to request workspace access.");
      setWorkspaceJoinValue("");
      await loadWorkspaceShellData();
    } catch (error) {
      console.error(error);
    } finally {
      setWorkspaceBusy(false);
    }
  }, [loadWorkspaceShellData, workspaceJoinValue]);

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    setWorkspaceBusy(true);
    try {
      const response = await fetch("/api/workspaces/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to switch workspace.");
      setWorkspaceHubOpen(false);
      await loadBootstrap();
      await loadWorkspaceShellData();
    } catch (error) {
      console.error(error);
    } finally {
      setWorkspaceBusy(false);
    }
  }, [loadBootstrap, loadWorkspaceShellData]);

  const deleteWorkspace = useCallback(async (workspaceId: string) => {
    setWorkspaceBusy(true);
    try {
      const response = await fetch("/api/workspaces/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to delete workspace.");
      await loadBootstrap();
      await loadWorkspaceShellData();
    } catch (error) {
      console.error(error);
    } finally {
      setWorkspaceBusy(false);
    }
  }, [loadBootstrap, loadWorkspaceShellData]);

  const respondToWorkspaceRequest = useCallback(async (requestId: string, decision: "approve" | "reject") => {
    try {
      const response = await fetch("/api/workspaces/requests/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, decision }),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to process request.");
      await loadWorkspaceShellData();
    } catch (error) {
      console.error(error);
    }
  }, [loadWorkspaceShellData]);

  const handleNotificationAction = useCallback(async (notification: WorkspaceNotificationItem, action: "approve" | "reject" | "open") => {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: notification.id }),
    }).catch(() => undefined);
    if (notification.type === "workspace-request" && notification.requestId && (action === "approve" || action === "reject")) {
      await respondToWorkspaceRequest(notification.requestId, action);
      await loadWorkspaceShellData();
      return;
    }
    if (notification.workspaceId && action === "open") {
      await switchWorkspace(notification.workspaceId);
      await loadWorkspaceShellData();
      return;
    }
    await loadWorkspaceShellData();
  }, [loadWorkspaceShellData, respondToWorkspaceRequest, switchWorkspace]);

  const updateMemberRole = useCallback(async (userId: string, role: MemberRole) => {
    if (!permissions?.manageMembers) return;
    try {
      await emitAck("member:role", { userId, role });
    } catch (error) {
      console.error(error);
    }
  }, [emitAck, permissions?.manageMembers]);

  const inboxEntries = useMemo<InboxEntry[]>(() => {
    const entries: InboxEntry[] = [];

    for (const notification of notifications) {
      entries.push({
        id: notification.id,
        title: notification.title,
        body: notification.detail,
        kind: notification.type === "workspace-request" ? "requests" : "system",
        createdAt: notification.createdAt ?? new Date().toISOString(),
        ctaLabel: notification.type === "workspace-request" ? "Review" : "Open",
        secondaryLabel: notification.type === "workspace-request" ? "Approve" : undefined,
        unread: notification.unread !== false,
      });
    }

    for (const task of myWaitingTasks) {
      entries.push({
        id: `assigned-${task.id}`,
        title: task.title,
        body: "Assigned to you and waiting for review or verification.",
        kind: "assigned",
        actorName: task.assigneeName,
        actorColor: task.assigneeColor,
        createdAt: task.updatedAt,
        ctaLabel: "Open task",
      });
    }

    for (const task of workspace?.tasks ?? []) {
      const mentionComment = task.comments.find((comment) => currentUser?.handle && comment.mentions.includes(currentUser.handle));
      if (mentionComment) {
        entries.push({
          id: `mention-${task.id}-${mentionComment.id}`,
          title: task.title,
          body: `${mentionComment.authorName} mentioned you: ${mentionComment.body}`,
          kind: "mentions",
          actorName: mentionComment.authorName,
          actorColor: mentionComment.authorColor,
          createdAt: mentionComment.createdAt,
          ctaLabel: "Reply",
        });
      }
    }

    return entries
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [currentUser?.handle, myWaitingTasks, notifications, workspace?.tasks]);

  const filteredInboxEntries = useMemo(() => {
    if (inboxFilter === "all") return inboxEntries;
    return inboxEntries.filter((entry) => entry.kind === inboxFilter);
  }, [inboxEntries, inboxFilter]);

  const commandMatches = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const destinationMatches = VIEWS.filter((item) => !normalized || item.label.toLowerCase().includes(normalized)).slice(0, 6);
    const taskMatches = filteredTasks.filter((task) => !normalized || task.title.toLowerCase().includes(normalized) || task.description.toLowerCase().includes(normalized)).slice(0, 6);
    return { destinationMatches, taskMatches };
  }, [filteredTasks, search]);

  const handleInboxOpen = useCallback(async (item: InboxEntry) => {
    const directNotification = notifications.find((notification) => notification.id === item.id);
    if (directNotification) {
      await handleNotificationAction(directNotification, directNotification.type === "workspace-request" ? "open" : "open");
      setView("inbox");
      return;
    }
    const task = workspace?.tasks.find((entry) => item.id.includes(entry.id));
    if (task) {
      openTaskDetail(task);
      return;
    }
    setView("inbox");
  }, [handleNotificationAction, notifications, openTaskDetail, setView, workspace?.tasks]);

  const handleInboxSecondary = useCallback(async (item: InboxEntry) => {
    const directNotification = notifications.find((notification) => notification.id === item.id);
    if (!directNotification || directNotification.type !== "workspace-request" || !directNotification.requestId) return;
    await handleNotificationAction(directNotification, "approve");
  }, [handleNotificationAction, notifications]);

  if (loading) return <LoadingScreen />;
  if (authRequired || !snapshot?.authenticated || !workspace || !currentUser || !permissions) {
    return <AuthScreen authBusy={authBusy} authError={authError} authForm={authForm} authInfo={authInfo} authMode={authMode} forgotEmail={forgotEmail} inviteToken={inviteToken} mfaChallengeToken={mfaChallengeToken} mfaCode={mfaCode} onChange={setAuthForm} onConfirmReset={confirmPasswordReset} onForgotEmailChange={setForgotEmail} onMfaCodeChange={setMfaCode} onModeChange={setAuthMode} onRequestPasswordReset={requestPasswordReset} onResetPasswordChange={setResetPassword} onSubmit={performAuth} resetPassword={resetPassword} resetToken={resetToken} />;
  }

  const activeWorkspace = workspaceCatalog.find((item) => item.isActive) ?? workspaceCatalog[0] ?? null;

  return (
    <div className="min-h-screen bg-app-gradient pb-24 text-foreground lg:pb-0">
      <button className="fixed left-0 top-1/2 z-30 hidden h-28 w-3 -translate-y-1/2 rounded-r-full bg-white/90 text-[10px] font-medium text-muted-foreground shadow-[0_12px_24px_rgba(43,75,185,0.08)] transition-all hover:w-10 lg:flex lg:items-center lg:justify-center" onClick={() => setSidebarCollapsed((current) => !current)} onMouseEnter={() => { if (sidebarCollapsed) setSidebarCollapsed(false); }} title={sidebarCollapsed ? "Open sidebar" : "Hide sidebar"} type="button">
        <span className="-rotate-90 opacity-0 transition-opacity hover:opacity-100">{sidebarCollapsed ? "Open" : "Hide"}</span>
      </button>

      <div className="flex min-h-screen w-full gap-1 px-0 py-1 sm:px-1">
        <aside className={cn("hidden shrink-0 flex-col rounded-[28px] bg-sidebar/95 p-3 shadow-[0_20px_60px_rgba(43,75,185,0.06)] backdrop-blur-xl transition-all duration-200 lg:flex", sidebarCollapsed ? "w-[76px]" : "w-[256px]")}>
          <button className="glass-surface mb-4 flex items-center gap-3 rounded-[22px] px-3 py-3 text-left" onClick={() => setSidebarCollapsed((current) => !current)} type="button">
            <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#2b4bb9,#4865d3)] text-white shadow-[0_12px_30px_rgba(43,75,185,0.28)]">
              <Sparkles className="size-5" />
            </div>
            {!sidebarCollapsed ? <span className="font-heading text-lg font-extrabold tracking-tight">VisualAI</span> : null}
          </button>

          <nav className="space-y-2">
            {VIEWS.map((item) => {
              const Icon = item.icon;
              const active = item.key === view && !workspaceHubOpen;
              return (
                <button
                  key={item.key}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left text-sm font-medium transition-all",
                    active ? "bg-[#dfe7ff] text-primary shadow-[0_12px_24px_rgba(43,75,185,0.08)]" : "text-muted-foreground hover:bg-white/70 hover:text-foreground",
                    sidebarCollapsed && "justify-center px-0",
                  )}
                  onClick={() => {
                    setWorkspaceHubOpen(false);
                    if (item.key === "projects") setProjectsTab("board");
                    setView(item.key);
                  }}
                  type="button"
                >
                  <Icon className="size-4" />
                  {!sidebarCollapsed ? item.label : null}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto" />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="glass-surface flex items-center justify-between gap-3 rounded-[26px] px-2.5 py-3 shadow-[0_20px_60px_rgba(43,75,185,0.05)] sm:px-3">
            <div className="relative min-w-[180px] md:min-w-[220px]">
              <button className="flex w-full items-center justify-between rounded-full bg-white/85 px-4 py-3 text-left text-sm font-medium shadow-[inset_0_0_0_1px_rgba(195,198,215,0.4)]" onClick={() => setWorkspaceHubOpen(true)} type="button">
                <span className="truncate">{activeWorkspace?.name ?? workspace.name}</span>
                <span className="text-xs text-muted-foreground">{activeWorkspace?.workspaceKey ?? workspace.workspaceKey}</span>
              </button>
            </div>

            <div className="flex flex-1 items-center justify-end gap-2">
              <div className="relative hidden min-w-[320px] max-w-[520px] flex-1 lg:block">
                <button className="flex w-full items-center justify-between rounded-full bg-white/85 px-4 py-3 text-left text-sm font-medium text-muted-foreground shadow-[inset_0_0_0_1px_rgba(195,198,215,0.35)]" onClick={() => setSearchOpen((current) => !current)} type="button">
                  <span className="inline-flex items-center gap-2">
                    <Command className="size-4 text-primary" />
                    Search or jump to tasks, projects, and views
                  </span>
                  <span className="text-xs">⌘K</span>
                </button>
                {searchOpen ? (
                  <div className="absolute right-0 z-20 mt-2 w-full rounded-[24px] bg-white/98 p-4 shadow-[0_18px_44px_rgba(43,75,185,0.12)] backdrop-blur-xl">
                    <input autoFocus className="input-shell" onChange={(event) => setSearch(event.target.value)} placeholder="Type to search tasks or jump to a destination…" value={search} />
                    <div className="mt-4 grid gap-4 xl:grid-cols-[180px_minmax(0,1fr)]">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Destinations</p>
                        <div className="space-y-2">
                          {commandMatches.destinationMatches.map((item) => {
                            const Icon = item.icon;
                            return (
                              <button className="flex w-full items-center gap-2 rounded-[16px] bg-slate-50 px-3 py-2 text-left text-sm font-medium transition hover:bg-slate-100" key={item.key} onClick={() => { setWorkspaceHubOpen(false); setView(item.key); setSearchOpen(false); }} type="button">
                                <Icon className="size-4 text-primary" />
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tasks</p>
                        <div className="space-y-2">
                          {commandMatches.taskMatches.length > 0 ? commandMatches.taskMatches.map((task) => (
                            <button className="flex w-full items-center justify-between gap-3 rounded-[16px] bg-slate-50 px-3 py-3 text-left transition hover:bg-slate-100" key={task.id} onClick={() => { openTaskDetail(task); setSearchOpen(false); }} type="button">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{task.title}</p>
                                <p className="truncate text-xs text-muted-foreground">{task.assigneeName} · due {task.dueDate}</p>
                              </div>
                              <Badge className={cn("rounded-full border-0", statusMeta[task.status].badgeClassName)}>{statusMeta[task.status].label}</Badge>
                            </button>
                          )) : <EmptyStateCard description="Try a task title, assignee, or label." title="No command results" />}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-full bg-white/80 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.3)]">
                <AvatarGroup>
                  {uniquePresence.slice(0, 3).map((member) => <Avatar key={member.id} size="sm"><AvatarFallback style={{ backgroundColor: member.color, color: "white" }}>{member.initials}</AvatarFallback></Avatar>)}
                  {uniquePresence.length > 3 ? <AvatarGroupCount>+{uniquePresence.length - 3}</AvatarGroupCount> : null}
                </AvatarGroup>
              </div>

              <div className="relative">
                <Button className="lg:hidden" onClick={() => setSearchOpen((current) => !current)} size="sm" variant="outline"><Search className="size-4" /></Button>
              </div>

              <div className="hidden rounded-full bg-white/80 px-3 py-1.5 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.3)] md:flex md:items-center md:gap-2">
                <CircleDot className={cn("size-3", connectionState === "live" ? "fill-emerald-500 text-emerald-500" : connectionState === "connecting" ? "fill-amber-400 text-amber-400" : "fill-rose-500 text-rose-500")} />
                <span className="text-xs font-medium text-muted-foreground">{connectionState}</span>
              </div>

              <button className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.35)]" onClick={() => setProfileDialogOpen(true)} type="button">
                <Avatar size="sm">
                  <AvatarFallback style={{ backgroundColor: currentUser.color, color: "white" }}>{getInitials(currentUser.name)}</AvatarFallback>
                </Avatar>
              </button>
            </div>
          </header>

          {surfaceNotice ? <div className={cn("fixed right-4 top-4 z-50 rounded-[18px] px-4 py-3 text-sm shadow-[0_18px_40px_rgba(15,23,42,0.12)]", surfaceNotice.tone === "success" ? "bg-emerald-50 text-emerald-800 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.18),0_18px_40px_rgba(16,185,129,0.10)]" : "bg-rose-50 text-rose-800 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.18),0_18px_40px_rgba(244,63,94,0.10)]")}>{surfaceNotice.message}</div> : null}
          {snapshot.deployment?.message ? <div className="rounded-[22px] bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.2)]"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">Enterprise deployment notice</p><p>{snapshot.deployment.message}</p></div></div></div> : null}
          {snapshot.enterpriseMeta?.licenseWarning ? <div className="rounded-[22px] bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.16)]">{snapshot.enterpriseMeta.licenseWarning}</div> : null}

          <main className="min-w-0 space-y-4">
            {workspaceHubOpen ? <WorkspaceHubView busy={workspaceBusy} createName={workspaceCreateName} joinValue={workspaceJoinValue} onCreateNameChange={setWorkspaceCreateName} onCreateWorkspace={createWorkspace} onDeleteWorkspace={deleteWorkspace} onJoinValueChange={setWorkspaceJoinValue} onJoinWorkspace={requestWorkspaceJoin} onRespondRequest={respondToWorkspaceRequest} onSwitchWorkspace={switchWorkspace} requests={workspaceJoinRequests} workspaces={workspaceCatalog} /> : null}
            {!workspaceHubOpen && view === "home" ? <HomeView focusTasks={focusTasks} inboxCount={inboxEntries.length} onOpenInbox={() => { setWorkspaceHubOpen(false); setView("inbox"); }} onOpenCalendar={() => setView("calendar")} onOpenCollaborate={() => { setView("collaborate"); }} onOpenTask={openTaskDetail} recentDecisionNotes={recentDecisionNotes} reviewTasks={waitingTasks} upcomingEvents={upcomingEvents} /> : null}
            {!workspaceHubOpen && view === "inbox" ? <InboxView activeFilter={inboxFilter} items={filteredInboxEntries} onFilterChange={setInboxFilter} onOpenItem={(item) => void handleInboxOpen(item)} onSecondaryAction={(item) => void handleInboxSecondary(item)} /> : null}
            {!workspaceHubOpen && view === "my-work" ? <MyWorkView dueTodayTasks={myDueTodayTasks} focusTasks={myFocusTasks} onOpenTask={openTaskDetail} recentTasks={myRecentTasks} waitingTasks={myWaitingTasks} /> : null}
            {!workspaceHubOpen && view === "projects" ? <ProjectsView activeTab={projectsTab} canEdit={permissions.editWorkspace} ganttGranularity={ganttGranularity} ganttRangeDays={ganttRangeDays} onDropTask={dropTaskToStatus} onGanttGranularityChange={(value) => { setGanttGranularity(value); setGanttRangeDays(value === "day" ? 60 : value === "week" ? 120 : 365); }} onOpenTask={openTaskDetail} onQuickCreate={quickCreateTask} onQuickPatch={(task, patch) => { void inlineUpdateTask(task.id, patch); }} onTabChange={setProjectsTab} onUpdateDependencies={updateTaskDependencies} onUpdateTaskDates={updateTaskDates} tasks={projectTasks} zoom={ganttZoom} onZoomChange={setGanttZoom} /> : null}
            {!workspaceHubOpen && view === "calendar" ? <CalendarView calendarViewMode={calendarViewMode} events={workspace.agenda} externalEvents={snapshot.externalAgenda ?? []} monthCursor={selectedDay} monthGrid={monthGrid} onCalendarViewModeChange={setCalendarViewMode} onCreateEvent={permissions.editCalendar ? (day) => openEventEditor(undefined, day) : undefined} onEditEvent={permissions.editCalendar ? openEventEditor : undefined} onMonthChange={setSelectedDay} onMoveEvent={permissions.editCalendar ? moveEventWindow : undefined} onResizeEvent={permissions.editCalendar ? resizeEventWindow : undefined} onSelectDay={setSelectedDay} selectedDay={selectedDay} /> : null}
            {!workspaceHubOpen && view === "collaborate" ? <CollaborateView canEdit={permissions.editNotes} onSceneChange={permissions.editNotes ? saveWhiteboardScene : undefined} scene={whiteboardScene} /> : null}
          </main>
        </div>
      </div>

      <div className="fixed inset-x-2 bottom-2 z-40 lg:hidden">
        <div className="rounded-[24px] bg-white/92 p-1.5 shadow-[0_18px_44px_rgba(43,75,185,0.12)] backdrop-blur-xl">
          <div className="grid grid-cols-5 gap-1.5">
            <button className={cn("flex flex-col items-center gap-1 rounded-[18px] px-2 py-2 text-xs font-medium", view === "home" ? "bg-[#dfe7ff] text-primary" : "text-muted-foreground")} onClick={() => { setWorkspaceHubOpen(false); setView("home"); }} type="button"><LayoutDashboard className="size-4" />Home</button>
            <button className={cn("flex flex-col items-center gap-1 rounded-[18px] px-2 py-2 text-xs font-medium", view === "inbox" ? "bg-[#dfe7ff] text-primary" : "text-muted-foreground")} onClick={() => { setWorkspaceHubOpen(false); setView("inbox"); }} type="button"><Inbox className="size-4" />Inbox</button>
            <button className={cn("flex flex-col items-center gap-1 rounded-[18px] px-2 py-2 text-xs font-medium", view === "my-work" ? "bg-[#dfe7ff] text-primary" : "text-muted-foreground")} onClick={() => { setWorkspaceHubOpen(false); setView("my-work"); }} type="button"><ListTodo className="size-4" />My Work</button>
            <button className={cn("flex flex-col items-center gap-1 rounded-[18px] px-2 py-2 text-xs font-medium", view === "projects" ? "bg-[#dfe7ff] text-primary" : "text-muted-foreground")} onClick={() => { setWorkspaceHubOpen(false); setProjectsTab("board"); setView("projects"); }} type="button"><Rocket className="size-4" />Projects</button>
            <div className="relative">
              <button className="flex w-full flex-col items-center gap-1 rounded-[18px] px-2 py-2 text-xs font-medium text-muted-foreground" onClick={() => setMobileMoreOpen((current) => !current)} type="button"><PanelsTopLeft className="size-4" />More</button>
              {mobileMoreOpen ? (
                <div className="absolute bottom-14 right-0 w-[220px] rounded-[22px] bg-white/98 p-3 shadow-[0_16px_40px_rgba(43,75,185,0.12)] backdrop-blur-xl">
                  <div className="space-y-2">
                    <Button className="w-full justify-start" onClick={() => { setView("calendar"); setMobileMoreOpen(false); }} size="sm" variant="outline"><CalendarDays className="size-4" />Calendar</Button>
                    <Button className="w-full justify-start" onClick={() => { setView("collaborate"); setMobileMoreOpen(false); }} size="sm" variant="outline"><PanelsTopLeft className="size-4" />Collaborate</Button>
                    <Button className="w-full justify-start" onClick={() => { setWorkspaceHubOpen(true); setMobileMoreOpen(false); }} size="sm" variant="outline"><Rocket className="size-4" />Workspaces</Button>
                    <Button className="w-full justify-start" onClick={() => { setMembersDialogOpen(true); setMobileMoreOpen(false); }} size="sm" variant="outline"><Users className="size-4" />Members</Button>
                    <Button className="w-full justify-start" onClick={() => { setProfileDialogOpen(true); setMobileMoreOpen(false); }} size="sm" variant="outline"><Sparkles className="size-4" />Settings</Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <TaskCreateDialog onChange={setTaskDraft} onOpenChange={setTaskDialogOpen} onSubmit={submitTask} open={taskDialogOpen} taskDraft={taskDraft} />
      {currentUser ? <TaskDetailDialog currentUser={currentUser} deletingAttachmentId={deletingAttachmentId} deletingCommentId={deletingCommentId} deletingTask={deletingTaskId === selectedTaskId} members={members} onCommentChange={setTaskCommentDraft} onCommentDelete={deleteTaskComment} onCommentSubmit={submitTaskComment} onDeleteTask={deleteTask} onFileDelete={deleteAttachment} onFileUpload={uploadAttachment} onOpenChange={setTaskDetailOpen} onReplyTargetChange={setReplyTargetId} onSave={saveTaskDetail} open={taskDetailOpen} permissions={permissions} replyTargetId={replyTargetId} selectedTask={selectedTask} setTaskDetailDraft={setTaskDetailDraft} taskCommentDraft={taskCommentDraft} taskDetailDraft={taskDetailDraft} uploadBusy={uploadBusy} userDirectory={userDirectory} /> : null}
      <EventDialog deleting={deletingEventId === editingEventId} editing={Boolean(editingEventId)} eventDraft={eventDraft} onChange={setEventDraft} onDelete={editingEventId ? deleteEvent : undefined} onOpenChange={setEventDialogOpen} onSubmit={submitEvent} open={eventDialogOpen} />
      <ProfileDialog canManageMembers={permissions.manageMembers} currentUser={currentUser} mfaManageCode={mfaManageCode} mfaSetup={mfaSetup} onBeginMfaSetup={beginMfaSetup} onChange={setProfileDraft} onDisableMfa={disableMfaForCurrentUser} onEnableMfa={enableMfaForCurrentUser} onLogout={logout} onManageMembers={() => { setProfileDialogOpen(false); setMembersDialogOpen(true); }} onMfaCodeChange={setMfaManageCode} onOpenAudit={() => { setProfileDialogOpen(false); void openAuditLog(); }} onOpenChange={setProfileDialogOpen} onSubmit={saveProfile} open={profileDialogOpen} profileDraft={profileDraft} />
      <MembersDialog currentUser={currentUser} generatedInviteLink={generatedInviteLink} inviteEmail={inviteEmail} inviteRole={inviteRole} members={members} onInviteCreate={createInviteLink} onInviteEmailChange={setInviteEmail} onInviteRoleChange={setInviteRole} onOpenChange={setMembersDialogOpen} onRoleChange={updateMemberRole} open={membersDialogOpen} />
      <SavedViewsDialog onApply={applySavedView} onCreate={createSavedView} onDelete={deleteSavedView} onOpenChange={setSavedViewsOpen} open={savedViewsOpen} savedViews={savedViews} />
      <AutomationDialog onOpenChange={setAutomationOpen} onToggle={toggleAutomationRule} open={automationOpen} rules={automationRules} />
      <InsightsDialog analytics={analytics} onOpenChange={setInsightsOpen} open={insightsOpen} />
      <AuditDialog auditLogs={auditLogs} onOpenChange={setAuditDialogOpen} open={auditDialogOpen} />
    </div>
  );
}
