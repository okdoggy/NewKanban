"use client";

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  Columns3,
  GripVertical,
  Inbox,
  ListTodo,
  Plus,
  Sparkles,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CALENDAR_VIEW_OPTIONS,
  EVENT_TYPE_META,
  GANTT_ZOOM_OPTIONS,
  priorityMeta,
  statusMeta,
  STATUS_ORDER,
  WIP_LIMITS,
} from "@/components/workspace/config";
import { WhiteboardCanvas } from "@/components/workspace/whiteboard-canvas";
import { ActionCard, EmptyStateCard, MetricCard } from "@/components/workspace/shared";
import {
  addDays,
  addMinutes,
  addMonths,
  differenceInDays,
  differenceInMinutes,
  endOfDay,
  formatDate,
  formatDateFromValue,
  isSameDay,
  isSameMonth,
  isWithinRange,
  parseDate,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "@/lib/date-utils";
import type {
  AgendaEvent,
  AnalyticsSummary,
  CalendarViewMode,
  GanttZoom,
  TaskItem,
  TaskPriority,
  TaskStatus,
  WhiteboardNote,
  WhiteboardScene,
  Workspace,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatWorkspaceName } from "@/lib/workspace-naming";

const ganttHeaderHeight = 52;
const ganttSidebarWidth = 280;
const calendarLabelColumnWidth = 84;
const calendarColumnMinWidth = 180;
const calendarHeaderHeight = 52;
const calendarHours = Array.from({ length: 14 }, (_, index) => index + 8);
const calendarHourHeight = 56;
const monthCellVisibleItems = 3;

function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateTimeLocalValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function cyclePriority(priority: TaskPriority): TaskPriority {
  if (priority === "low") return "medium";
  if (priority === "medium") return "high";
  return "low";
}

function cycleTaskStatus(status: TaskStatus): TaskStatus {
  const currentIndex = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length] ?? "todo";
}

function expandRecurringEvents(events: AgendaEvent[], rangeStart: Date, rangeEnd: Date) {
  const results: AgendaEvent[] = [];

  for (const event of events) {
    const start = parseDate(event.start);
    const end = parseDate(event.end);
    const durationMinutes = Math.max(30, differenceInMinutes(start, end));
    const recurrence = event.recurrence ?? "none";

    if (!recurrence || recurrence === "none") {
      if (isWithinRange(start, startOfDay(rangeStart), endOfDay(rangeEnd))) results.push(event);
      continue;
    }

    let cursor = new Date(start);
    let occurrenceIndex = 0;
    while (cursor <= rangeEnd && occurrenceIndex < 40) {
      if (isWithinRange(cursor, startOfDay(rangeStart), endOfDay(rangeEnd))) {
        results.push({
          ...event,
          id: `${event.id}-occurrence-${occurrenceIndex}`,
          start: cursor.toISOString(),
          end: addMinutes(cursor, durationMinutes).toISOString(),
        });
      }
      occurrenceIndex += 1;
      if (recurrence === "daily") cursor = addDays(cursor, 1);
      else if (recurrence === "weekly") cursor = addDays(cursor, 7);
      else if (recurrence === "monthly") cursor = addMonths(cursor, 1);
      else break;
    }
  }

  return results.sort((left, right) => left.start.localeCompare(right.start));
}

function ActionList({ title, description, items, emptyTitle, emptyDescription, onOpenTask, accent, compact = false, hideDescription = false, showAssignee = true }: { title: string; description: string; items: TaskItem[]; emptyTitle: string; emptyDescription: string; onOpenTask: (task: TaskItem) => void; accent: string; compact?: boolean; hideDescription?: boolean; showAssignee?: boolean; }) {
  return (
    <Card className="border-0 bg-white/85 shadow-[0_18px_44px_rgba(43,75,185,0.06)]">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">{title}</CardTitle>
        {!hideDescription ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={cn(compact ? "space-y-2" : "space-y-3")}>
        {items.length > 0 ? items.slice(0, 4).map((task) => (
          <button className={cn("flex w-full justify-between gap-3 rounded-[18px] bg-slate-50 text-left shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]", compact ? "items-center px-3 py-2" : "items-start px-4 py-3")} key={task.id} onClick={() => onOpenTask(task)} type="button">
            <div className="min-w-0">
              {compact ? <p className="truncate text-sm font-medium">{task.title}{showAssignee ? ` · ${task.assigneeName}` : ""} · due {formatDateFromValue(task.dueDate, { month: "short", day: "numeric" })}</p> : <>
                <p className="truncate text-sm font-semibold">{task.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{task.assigneeName} · due {formatDateFromValue(task.dueDate, { month: "short", day: "numeric" })}</p>
              </>}
            </div>
            <Badge className={cn("rounded-full border-0", accent)}>{statusMeta[task.status].label}</Badge>
          </button>
        )) : <EmptyStateCard description={emptyDescription} title={emptyTitle} />}
      </CardContent>
    </Card>
  );
}

interface WorkspaceHubItem {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
  memberCount?: number;
  pendingRequestCount?: number;
  isActive?: boolean;
}

interface WorkspaceDiscoverableItem {
  id: string;
  name: string;
  memberCount?: number;
  joinRequested?: boolean;
}

export type InboxFilter = "all" | "assigned" | "mentions" | "requests" | "system";
export type ProjectsTab = "board" | "timeline" | "list";
export type InboxAction = "open" | "approve" | "reject";

export interface InboxEntry {
  id: string;
  title: string;
  body: string;
  kind: InboxFilter | "all";
  actorName?: string;
  actorColor?: string;
  createdAt: string;
  ctaLabel: string;
  primaryAction?: InboxAction;
  secondaryLabel?: string;
  secondaryAction?: InboxAction;
  unread?: boolean;
}

function EventList({ title, description, items, emptyTitle, emptyDescription, onOpenCalendar, compact = false, hideDescription = false }: { title: string; description: string; items: AgendaEvent[]; emptyTitle: string; emptyDescription: string; onOpenCalendar: () => void; compact?: boolean; hideDescription?: boolean; }) {
  return (
    <Card className="border-0 bg-white/85 shadow-[0_18px_44px_rgba(43,75,185,0.06)]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{title}</CardTitle>
            {!hideDescription ? <CardDescription>{description}</CardDescription> : null}
          </div>
          <Button onClick={onOpenCalendar} size="sm" variant="outline">Open calendar</Button>
        </div>
      </CardHeader>
      <CardContent className={cn(compact ? "space-y-2" : "space-y-3")}>
        {items.length > 0 ? items.slice(0, 4).map((event) => (
          <button className={cn("flex w-full justify-between gap-3 rounded-[18px] bg-slate-50 text-left shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]", compact ? "items-center px-3 py-2" : "items-start px-4 py-3")} key={event.id} onClick={onOpenCalendar} type="button">
            <div className="min-w-0">
              {compact ? <p className="truncate text-sm font-medium">{event.title} · {formatDate(parseDate(event.start), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p> : <>
                <p className="truncate text-sm font-semibold">{event.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(parseDate(event.start), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
              </>}
            </div>
            <Badge className={cn("rounded-full border-0", EVENT_TYPE_META[event.type] ?? "bg-slate-100 text-slate-600")}>{event.type}</Badge>
          </button>
        )) : <EmptyStateCard description={emptyDescription} title={emptyTitle} />}
      </CardContent>
    </Card>
  );
}

function NoteList({ title, description, items, emptyTitle, emptyDescription, onOpenCollaborate, compact = false, hideDescription = false }: { title: string; description: string; items: WhiteboardNote[]; emptyTitle: string; emptyDescription: string; onOpenCollaborate: () => void; compact?: boolean; hideDescription?: boolean; }) {
  return (
    <Card className="border-0 bg-white/85 shadow-[0_18px_44px_rgba(43,75,185,0.06)]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{title}</CardTitle>
            {!hideDescription ? <CardDescription>{description}</CardDescription> : null}
          </div>
          <Button onClick={onOpenCollaborate} size="sm" variant="outline">Open collaborate</Button>
        </div>
      </CardHeader>
      <CardContent className={cn(compact ? "space-y-2" : "space-y-3")}>
        {items.length > 0 ? items.slice(0, 4).map((note) => (
          <button className={cn("flex w-full justify-between gap-3 rounded-[18px] bg-slate-50 text-left shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]", compact ? "items-center px-3 py-2" : "items-start px-4 py-3")} key={note.id} onClick={onOpenCollaborate} type="button">
            <div className="min-w-0">
              {compact ? <p className="truncate text-sm font-medium">{note.title}{note.decisionOwnerName || note.assigneeName ? ` · ${note.decisionOwnerName || note.assigneeName}` : ""}{note.decisionDueDate ? ` · due ${note.decisionDueDate}` : ""}</p> : <>
                <p className="truncate text-sm font-semibold">{note.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{note.decisionOwnerName || note.assigneeName}{note.decisionDueDate ? ` · due ${note.decisionDueDate}` : ""}</p>
              </>}
            </div>
            <Badge className="rounded-full bg-violet-100 text-violet-700">{note.section ?? "idea"}</Badge>
          </button>
        )) : <EmptyStateCard description={emptyDescription} title={emptyTitle} />}
      </CardContent>
    </Card>
  );
}

export function HomeView({
  inboxCount,
  focusTasks,
  reviewTasks,
  recentDecisionNotes,
  upcomingEvents,
  onOpenTask,
  onOpenInbox,
  onOpenCalendar,
  onOpenCollaborate,
}: {
  inboxCount: number;
  focusTasks: TaskItem[];
  reviewTasks: TaskItem[];
  recentDecisionNotes: WhiteboardNote[];
  upcomingEvents: AgendaEvent[];
  onOpenTask: (task: TaskItem) => void;
  onOpenInbox: () => void;
  onOpenCalendar: () => void;
  onOpenCollaborate: () => void;
}) {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-3">
        <ActionCard compact count={inboxCount} description="Open the inbox to triage mentions, assignments, and requests." hideDescription icon={Inbox} onClick={onOpenInbox} title="Inbox" tone="amber" />
        <ActionCard compact count={focusTasks.length} description="Execution work ready to move right now." hideDescription icon={ListTodo} onClick={() => focusTasks[0] ? onOpenTask(focusTasks[0]) : undefined} title="Today" tone="primary" />
        <ActionCard compact count={upcomingEvents.length} description="Upcoming commitments and linked planning moments." hideDescription icon={CalendarDays} onClick={onOpenCalendar} title="Upcoming schedule" tone="emerald" />
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <ActionList accent="bg-blue-100 text-blue-700" compact description="Tasks most ready to advance in the next session." emptyDescription="Once work is assigned and prioritized, your focus queue will surface here." emptyTitle="No active focus queue" hideDescription items={focusTasks} onOpenTask={onOpenTask} title="Focus now" />
        <ActionList accent="bg-amber-100 text-amber-700" compact description="Work waiting for feedback, approval, or verification." emptyDescription="Review-ready work will collect here." emptyTitle="No review queue" hideDescription items={reviewTasks} onOpenTask={onOpenTask} title="Needs review" />
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <NoteList compact description="Recent decisions and follow-ups captured for the team." emptyDescription="Structured decisions will appear here once notes are captured." emptyTitle="No recent decisions" hideDescription items={recentDecisionNotes} onOpenCollaborate={onOpenCollaborate} title="Recent decisions" />
        <EventList compact description="Linked events and shared commitments coming up next." emptyDescription="Upcoming events will appear here once the calendar is in use." emptyTitle="No upcoming schedule" hideDescription items={upcomingEvents} onOpenCalendar={onOpenCalendar} title="Upcoming schedule" />
      </section>
    </div>
  );
}

export function OverviewView({
  analytics,
  todayTasks,
  dueSoonTasks,
  atRiskTasks,
  reviewTasks,
  activity,
  onOpenTask,
  onOpenActivity,
}: {
  analytics: AnalyticsSummary | null;
  todayTasks: TaskItem[];
  dueSoonTasks: TaskItem[];
  atRiskTasks: TaskItem[];
  reviewTasks: TaskItem[];
  activity: Workspace["activity"];
  onOpenTask: (task: TaskItem) => void;
  onOpenActivity: (activity: Workspace["activity"][number]) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Activity} label="Completion rate" tone="success" value={`${analytics?.completionRate ?? 0}%`} />
        <MetricCard icon={Clock3} label="Due soon" tone="primary" value={String(analytics?.dueSoonTasks ?? 0)} />
        <MetricCard icon={AlertTriangle} label="Blocked" tone="secondary" value={String(analytics?.blockedTasks ?? 0)} />
        <MetricCard icon={CalendarDays} label="Events today" tone="neutral" value={String(analytics?.eventsToday ?? 0)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ActionList accent="bg-blue-100 text-blue-700" description="Tasks due today or already on your plate." emptyDescription="Assigned work and same-day deadlines will surface here." emptyTitle="Nothing urgent today" items={todayTasks} onOpenTask={onOpenTask} title="Today" />
        <ActionList accent="bg-violet-100 text-violet-700" description="Deadlines coming up in the next 72 hours." emptyDescription="Upcoming deadlines will appear here as the sprint fills out." emptyTitle="Nothing due soon" items={dueSoonTasks} onOpenTask={onOpenTask} title="Due soon" />
        <ActionList accent="bg-rose-100 text-rose-700" description="Blocked or overdue work that needs intervention." emptyDescription="When work becomes blocked or overdue, it will be elevated here." emptyTitle="No work at risk" items={atRiskTasks} onOpenTask={onOpenTask} title="At risk" />
        <ActionList accent="bg-amber-100 text-amber-700" description="Work waiting for feedback, approval, or verification." emptyDescription="Tasks in review will show up here for quick follow-up." emptyTitle="No review queue" items={reviewTasks} onOpenTask={onOpenTask} title="Needs attention" />
      </section>

      <Card className="glass-surface border-0">
        <CardContent className="space-y-2 p-4">
          {activity.length > 0 ? activity.slice(0, 6).map((item) => (
            <button className="flex w-full items-center gap-3 rounded-[18px] px-3 py-2 text-left transition hover:bg-white/80" key={item.id} onClick={() => onOpenActivity(item)} type="button">
              <div className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: item.actorColor }}>
                {item.actorName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm leading-6">
                  <span className="font-semibold">{item.actorName}</span> {item.action} <span className="font-semibold text-primary">{item.entityTitle}</span>
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(parseDate(item.createdAt), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
              </div>
            </button>
          )) : <EmptyStateCard description="Auth, edits, comments, and automation activity will appear here as the workspace becomes active." title="No recent activity" />}
        </CardContent>
      </Card>
    </div>
  );
}

export function WorkspaceHubView({ workspaces, discoverableWorkspaces, busy, onCreateWorkspace, onJoinWorkspace, onSwitchWorkspace, onManageWorkspace, onDeleteWorkspace }: { workspaces: WorkspaceHubItem[]; discoverableWorkspaces: WorkspaceDiscoverableItem[]; busy: boolean; onCreateWorkspace: (name: string) => Promise<void> | void; onJoinWorkspace: (workspaceId: string) => Promise<void> | void; onSwitchWorkspace: (workspaceId: string) => void; onManageWorkspace: (workspaceId: string) => void; onDeleteWorkspace: (workspaceId: string) => void; }) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState("");
  const [joinDialogWorkspaceId, setJoinDialogWorkspaceId] = useState<string | null>(null);

  const allWorkspaces = useMemo(() => {
    const joinedIds = new Set(workspaces.map((workspace) => workspace.id));
    const joinedRows = workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      role: workspace.role,
      memberCount: workspace.memberCount ?? 0,
      pendingRequestCount: workspace.pendingRequestCount ?? 0,
      isActive: Boolean(workspace.isActive),
      joined: true,
      joinRequested: false,
    }));
    const discoverableRows = discoverableWorkspaces
      .filter((workspace) => !joinedIds.has(workspace.id))
      .map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        role: null,
        memberCount: workspace.memberCount ?? 0,
        pendingRequestCount: 0,
        isActive: false,
        joined: false,
        joinRequested: Boolean(workspace.joinRequested),
      }));

    return [...joinedRows, ...discoverableRows].sort((left, right) =>
      Number(right.isActive) - Number(left.isActive)
      || Number(right.joined) - Number(left.joined)
      || formatWorkspaceName(left.name).localeCompare(formatWorkspaceName(right.name)));
  }, [discoverableWorkspaces, workspaces]);

  const joinDialogWorkspace = joinDialogWorkspaceId
    ? allWorkspaces.find((workspace) => workspace.id === joinDialogWorkspaceId) ?? null
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <h1 className="font-heading text-3xl tracking-tight">Workspaces</h1>
        <Button onClick={() => setCreateDialogOpen(true)} size="sm">Create</Button>
      </div>

      <Card className="border-0 bg-white/90 shadow-[0_18px_44px_rgba(43,75,185,0.06)]">
        <CardContent className="p-0">
          <div className="max-h-[70vh] overflow-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="border-b bg-background/95">
                  <TableHead className="sticky top-0 z-10 w-[32%] bg-background/95">Workspace</TableHead>
                  <TableHead className="sticky top-0 z-10 w-[18%] bg-background/95">Status</TableHead>
                  <TableHead className="sticky top-0 z-10 w-[12%] bg-background/95">Members</TableHead>
                  <TableHead className="sticky top-0 z-10 w-[38%] bg-background/95 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allWorkspaces.length > 0 ? allWorkspaces.map((workspace) => (
                  <TableRow key={workspace.id}>
                    <TableCell className="truncate py-3 font-medium">{formatWorkspaceName(workspace.name)}</TableCell>
                    <TableCell className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {workspace.role ? <Badge className={cn("rounded-full border-0", workspace.role === "owner" ? "bg-emerald-100 text-emerald-700" : workspace.role === "editor" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600")}>{workspace.role}</Badge> : <Badge className="rounded-full bg-slate-100 text-slate-600">available</Badge>}
                        {workspace.isActive ? <Badge className="rounded-full bg-primary/10 text-primary">active</Badge> : null}
                        {workspace.joinRequested ? <Badge className="rounded-full bg-slate-100 text-slate-600">requested</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground">{workspace.memberCount}</TableCell>
                    <TableCell className="py-3">
                      <div className="flex justify-end gap-2">
                        <Button disabled={!workspace.joined} onClick={() => onSwitchWorkspace(workspace.id)} size="sm" variant="outline">Open</Button>
                        {workspace.role === "owner" ? <Button onClick={() => onManageWorkspace(workspace.id)} size="sm" variant="outline">Manage</Button> : null}
                        {workspace.role === "owner" ? <Button onClick={() => onDeleteWorkspace(workspace.id)} size="sm" variant="ghost">Delete</Button> : null}
                        <Button disabled={workspace.joined || workspace.joinRequested || busy} onClick={() => setJoinDialogWorkspaceId(workspace.id)} size="sm" variant="outline">
                          {workspace.joined ? "Joined" : workspace.joinRequested ? "Requested" : "Join"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : <TableRow><TableCell className="py-8 text-center text-sm text-muted-foreground" colSpan={4}>No workspaces yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog onOpenChange={setCreateDialogOpen} open={createDialogOpen}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4"><DialogTitle>Create workspace</DialogTitle></DialogHeader>
          <div className="space-y-4 px-5 py-5">
            <Input autoFocus onChange={(event) => setCreateDraft(event.target.value)} placeholder="Workspace name" value={createDraft} />
          </div>
          <DialogFooter className="mt-0" showCloseButton>
            <Button disabled={busy || !createDraft.trim()} onClick={async () => { await onCreateWorkspace(createDraft.trim()); setCreateDraft(""); setCreateDialogOpen(false); }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => { if (!open) setJoinDialogWorkspaceId(null); }} open={Boolean(joinDialogWorkspace)}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4"><DialogTitle>Request access</DialogTitle></DialogHeader>
          <div className="px-5 py-5 text-sm text-muted-foreground">
            {joinDialogWorkspace ? `${formatWorkspaceName(joinDialogWorkspace.name)}의 owner에게 참가 여부 승인 메시지를 보내겠습니까?` : ""}
          </div>
          <DialogFooter className="mt-0" showCloseButton>
            <Button
              disabled={busy || !joinDialogWorkspace}
              onClick={async () => {
                if (!joinDialogWorkspace) return;
                await onJoinWorkspace(joinDialogWorkspace.id);
                setJoinDialogWorkspaceId(null);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function InboxView({ activeFilter, onFilterChange, items, onOpenItem, onPrimaryAction, onSecondaryAction }: { activeFilter: InboxFilter; onFilterChange: (value: InboxFilter) => void; items: InboxEntry[]; onOpenItem: (item: InboxEntry) => void; onPrimaryAction?: (item: InboxEntry) => void; onSecondaryAction?: (item: InboxEntry) => void; }) {
  const filters: Array<{ key: InboxFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "assigned", label: "Assigned" },
    { key: "mentions", label: "Mentions" },
    { key: "requests", label: "Requests" },
    { key: "system", label: "System" },
  ];

  return (
    <div className="space-y-6">
      <Card className="glass-surface border-0">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="font-heading text-4xl">Inbox</CardTitle>
            <CardDescription>Triage mentions, approvals, requests, and review follow-ups from one place.</CardDescription>
          </div>
          <Tabs onValueChange={(value) => onFilterChange(value as InboxFilter)} value={activeFilter}>
            <TabsList>
              {filters.map((filter) => <TabsTrigger key={filter.key} value={filter.key}>{filter.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        </CardHeader>
      </Card>

      <Card className="border-0 bg-white/90 shadow-[0_18px_44px_rgba(43,75,185,0.08)]">
        <CardContent className="space-y-3 p-4">
          {items.length > 0 ? items.map((item) => (
            <div className="flex flex-col gap-4 rounded-[22px] bg-slate-50 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.24)] md:flex-row md:items-center md:justify-between" key={item.id}>
              <button className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => onOpenItem(item)} type="button">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: item.actorColor ?? "#2b4bb9" }}>
                  {(item.actorName ?? item.title).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{item.title}</p>
                    {item.unread ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
                    <Badge className="rounded-full bg-white text-muted-foreground">{item.kind}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{formatDate(parseDate(item.createdAt), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                </div>
              </button>
              <div className="flex shrink-0 gap-2">
                <Button onClick={() => (onPrimaryAction ?? onOpenItem)(item)} size="sm">{item.ctaLabel}</Button>
                {item.secondaryLabel && onSecondaryAction ? <Button onClick={() => onSecondaryAction(item)} size="sm" variant="outline">{item.secondaryLabel}</Button> : null}
              </div>
            </div>
          )) : <EmptyStateCard description="When mentions, approvals, requests, and follow-ups come in, they will collect here." title="Inbox is clear" />}
        </CardContent>
      </Card>
    </div>
  );
}

export function MyWorkView({ focusTasks, dueTodayTasks, waitingTasks, recentTasks, onOpenTask }: { focusTasks: TaskItem[]; dueTodayTasks: TaskItem[]; waitingTasks: TaskItem[]; recentTasks: TaskItem[]; onOpenTask: (task: TaskItem) => void; }) {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-3">
        <ActionCard compact count={focusTasks.length} description="Tasks most ready to move right now." hideDescription icon={ListTodo} onClick={() => focusTasks[0] ? onOpenTask(focusTasks[0]) : undefined} title="Focus now" tone="primary" />
        <ActionCard compact count={dueTodayTasks.length} description="Work with same-day deadlines or commitments." hideDescription icon={CalendarDays} onClick={() => dueTodayTasks[0] ? onOpenTask(dueTodayTasks[0]) : undefined} title="Due today" tone="amber" />
        <ActionCard compact count={waitingTasks.length} description="Items awaiting review or approval." hideDescription icon={Inbox} onClick={() => waitingTasks[0] ? onOpenTask(waitingTasks[0]) : undefined} title="Waiting" tone="emerald" />
      </section>

      <section className="grid gap-3 xl:grid-cols-3">
        <ActionList accent="bg-blue-100 text-blue-700" compact description="Most important work to advance in the next session." emptyDescription="Tasks assigned to you will appear here once work is distributed." emptyTitle="Nothing in focus" hideDescription items={focusTasks} onOpenTask={onOpenTask} showAssignee={false} title="Focus now" />
        <ActionList accent="bg-amber-100 text-amber-700" compact description="Tasks due today." emptyDescription="Items with today's due date will be highlighted here." emptyTitle="Nothing due today" hideDescription items={dueTodayTasks} onOpenTask={onOpenTask} showAssignee={false} title="Due today" />
        <ActionList accent="bg-violet-100 text-violet-700" compact description="Tasks waiting on review or verification." emptyDescription="Review-ready work will appear here." emptyTitle="Nothing waiting" hideDescription items={waitingTasks} onOpenTask={onOpenTask} showAssignee={false} title="Waiting" />
      </section>

      <Card className="border-0 bg-white/90 shadow-[0_18px_44px_rgba(43,75,185,0.08)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">Recently updated</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTasks.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTasks.map((task) => (
                  <TableRow className="cursor-pointer" key={task.id} onClick={() => onOpenTask(task)}>
                    <TableCell><p className="font-medium">{task.title}</p></TableCell>
                    <TableCell><Badge className={cn("rounded-full border-0", statusMeta[task.status].badgeClassName)}>{statusMeta[task.status].label}</Badge></TableCell>
                    <TableCell><Badge className={cn("rounded-full border-0", priorityMeta[task.priority])}>{task.priority}</Badge></TableCell>
                    <TableCell>{formatDateFromValue(task.dueDate, { month: "short", day: "numeric" })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <EmptyStateCard description="Recently updated work will appear here after you interact with tasks." title="No recent work yet" />}
        </CardContent>
      </Card>
    </div>
  );
}

export function ProjectsView({ activeTab, onTabChange, tasks, onDropTask, onOpenTask, onQuickCreate, onQuickPatch, canEdit, zoom, onZoomChange, onUpdateTaskDates, onUpdateDependencies, ganttGranularity, ganttRangeDays, onGanttGranularityChange }: { activeTab: ProjectsTab; onTabChange: (value: ProjectsTab) => void; tasks: TaskItem[]; onDropTask: (taskId: string, nextStatus: TaskStatus) => void; onOpenTask: (task: TaskItem) => void; onQuickCreate: (status: TaskStatus, title: string) => void; onQuickPatch: (task: TaskItem, patch: Partial<TaskItem>) => void; canEdit: boolean; zoom: GanttZoom; onZoomChange: (value: GanttZoom) => void; onUpdateTaskDates: (taskId: string, startDate: string, dueDate: string) => void; onUpdateDependencies: (taskId: string, dependencyIds: string[]) => void; ganttGranularity: "day" | "week" | "month"; ganttRangeDays: number; onGanttGranularityChange: (value: "day" | "week" | "month") => void; }) {
  return (
    <div className="space-y-4">
      <Card className="glass-surface border-0">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 py-4">
          <CardTitle className="font-heading text-3xl leading-none">Projects</CardTitle>
          <Tabs onValueChange={(value) => onTabChange(value as ProjectsTab)} value={activeTab}>
            <TabsList>
              <TabsTrigger value="board">Board</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="list">List</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
      </Card>

      {activeTab === "board" ? <KanbanView boardMode="board" canEdit={canEdit} onBoardModeChange={() => undefined} onDropTask={onDropTask} onOpenTask={onOpenTask} onQuickCreate={onQuickCreate} onQuickPatch={onQuickPatch} showModeTabs={false} tasks={tasks} /> : null}
      {activeTab === "timeline" ? <GanttView ganttGranularity={ganttGranularity} ganttRangeDays={ganttRangeDays} onGanttGranularityChange={onGanttGranularityChange} onOpenTask={onOpenTask} onUpdateDependencies={onUpdateDependencies} onUpdateTaskDates={onUpdateTaskDates} tasks={tasks} zoom={zoom} onZoomChange={onZoomChange} /> : null}
      {activeTab === "list" ? <KanbanView boardMode="list" canEdit={canEdit} onBoardModeChange={() => undefined} onDropTask={onDropTask} onOpenTask={onOpenTask} onQuickCreate={onQuickCreate} onQuickPatch={onQuickPatch} showModeTabs={false} tasks={tasks} /> : null}
    </div>
  );
}

export function CollaborateView({ canEdit, scene, onSceneChange }: { canEdit: boolean; scene?: WhiteboardScene; onSceneChange?: (scene: WhiteboardScene, reason?: "auto" | "manual") => void | Promise<void>; }) {
  return (
    <div className="space-y-6">
      <Card className="glass-surface border-0">
        <CardHeader>
          <CardTitle className="font-heading text-4xl">Collaborate</CardTitle>
        </CardHeader>
      </Card>
      <WhiteboardView canEdit={canEdit} onSceneChange={onSceneChange} scene={scene} />
    </div>
  );
}

function TaskCard({ task, onDragEnd, onDragStart, onOpenTask, canEdit }: { task: TaskItem; onDragEnd: () => void; onDragStart: () => void; onOpenTask: (task: TaskItem) => void; canEdit: boolean; }) {
  return (
    <Card className="border-0 bg-white/90 shadow-[0_18px_44px_rgba(43,75,185,0.08)]">
      <CardContent className="space-y-3 p-4" onDoubleClick={() => onOpenTask(task)}>
        <div className="flex items-start gap-2.5">
          {canEdit ? <button className="mt-0.5 inline-flex cursor-grab rounded-full bg-slate-100 p-1 text-slate-400 active:cursor-grabbing" draggable onClick={(event) => event.stopPropagation()} onDragEnd={(event) => { event.stopPropagation(); onDragEnd(); }} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; onDragStart(); }} type="button"><GripVertical className="size-3.5" /></button> : null}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <h4 className="line-clamp-1 text-sm font-semibold tracking-tight">{task.title}</h4>
              <Badge className={cn("shrink-0 rounded-full border-0 px-2 py-0.5 text-[10px]", statusMeta[task.status].badgeClassName)}>{statusMeta[task.status].label}</Badge>
            </div>
            <p className="line-clamp-1 text-xs text-muted-foreground">{task.description || "No description yet."}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge className={cn("rounded-full border-0 px-2 py-0.5 text-[10px]", priorityMeta[task.priority])}>{task.priority}</Badge>
          <span>{task.assigneeName}</span>
          <span>•</span>
          <span>Due {formatDateFromValue(task.dueDate, { month: "short", day: "numeric" })}</span>
          <span>•</span>
          <span>{task.progress}%</span>
          {task.blocked ? <><span>•</span><span className="font-semibold text-rose-600">Blocked</span></> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function KanbanView({ tasks, boardMode, onBoardModeChange, onDropTask, onOpenTask, onQuickCreate, onQuickPatch, canEdit, showModeTabs = true }: { tasks: TaskItem[]; boardMode: "board" | "list"; onBoardModeChange: (value: "board" | "list") => void; onDropTask: (taskId: string, nextStatus: TaskStatus) => void; onOpenTask: (task: TaskItem) => void; onQuickCreate: (status: TaskStatus, title: string) => void; onQuickPatch: (task: TaskItem, patch: Partial<TaskItem>) => void; canEdit: boolean; showModeTabs?: boolean; }) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [suppressClickTaskId, setSuppressClickTaskId] = useState<string | null>(null);
  const [quickDrafts, setQuickDrafts] = useState<Record<TaskStatus, string>>({ todo: "", progress: "", review: "", done: "" });
  const groupedTasks = STATUS_ORDER.map((status) => ({ status, tasks: tasks.filter((task) => task.status === status) }));

  return (
    <Card className="glass-surface border-0 overflow-hidden">
      {showModeTabs ? (
        <CardHeader className="flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <Tabs onValueChange={(value) => onBoardModeChange(value as "board" | "list")} value={boardMode}>
            <TabsList>
              <TabsTrigger value="board"><Columns3 className="size-4" />Board</TabsTrigger>
              <TabsTrigger value="list"><Activity className="size-4" />List</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
      ) : null}
      <CardContent>
        {boardMode === "board" ? (
          <div className="grid gap-4 xl:grid-cols-4">
            {groupedTasks.map(({ status, tasks: columnTasks }) => {
              const wipLimit = WIP_LIMITS[status];
              const overLimit = columnTasks.length > wipLimit;
              return (
                <div className={cn("space-y-3 rounded-[22px] p-2 transition-colors hover:bg-white/40", overLimit && "bg-rose-50/70")} key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggedTaskId) { onDropTask(draggedTaskId, status); setDraggedTaskId(null); } }}>
                  <div className="flex items-center gap-2 px-1">
                    <span className={cn("h-2.5 w-2.5 rounded-full", statusMeta[status].dot)} />
                    <h3 className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">{statusMeta[status].label}</h3>
                    <Badge className="rounded-full bg-white/80 text-muted-foreground">{columnTasks.length}</Badge>
                  </div>
                  {canEdit ? <div className="rounded-[18px] bg-white/80 px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.24)]"><div className="flex gap-2"><input className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" onChange={(event) => setQuickDrafts((current) => ({ ...current, [status]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && quickDrafts[status].trim()) { onQuickCreate(status, quickDrafts[status]); setQuickDrafts((current) => ({ ...current, [status]: "" })); } }} placeholder={`Quick add to ${statusMeta[status].label.toLowerCase()}`} value={quickDrafts[status]} /><Button onClick={() => { if (!quickDrafts[status].trim()) return; onQuickCreate(status, quickDrafts[status]); setQuickDrafts((current) => ({ ...current, [status]: "" })); }} size="sm">Add</Button></div></div> : null}
                  {columnTasks.length > 0 ? columnTasks.map((task) => <TaskCard canEdit={canEdit} key={task.id} onDragEnd={() => setDraggedTaskId(null)} onDragStart={() => { setDraggedTaskId(task.id); setSuppressClickTaskId(task.id); window.setTimeout(() => setSuppressClickTaskId(null), 180); }} onOpenTask={(nextTask) => { if (suppressClickTaskId === nextTask.id) return; onOpenTask(nextTask); }} task={task} />) : <EmptyStateCard description={canEdit ? "Drop a task here or quick-add one in this lane." : "This lane is currently empty."} title={`No ${statusMeta[status].label.toLowerCase()} tasks`} />}
                </div>
              );
            })}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Dependencies</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell><div className="space-y-1"><button className="font-medium hover:text-primary" onClick={() => onOpenTask(task)} type="button">{task.title}</button><p className="max-w-[420px] text-xs text-muted-foreground">{task.description || "No description yet."}</p></div></TableCell>
                  <TableCell>{task.assigneeName}</TableCell>
                  <TableCell><button className={cn("rounded-full border-0 px-2 py-1 text-xs", statusMeta[task.status].badgeClassName, !canEdit && "cursor-default")} onClick={() => { if (canEdit) onQuickPatch(task, { status: cycleTaskStatus(task.status) }); }} type="button">{statusMeta[task.status].label}</button></TableCell>
                  <TableCell><button className={cn("rounded-full border-0 px-2 py-1 text-xs", priorityMeta[task.priority])} onClick={(event) => { event.stopPropagation(); if (canEdit) onQuickPatch(task, { priority: cyclePriority(task.priority) }); }} type="button">{task.priority}</button></TableCell>
                  <TableCell><input className="w-[130px] bg-transparent text-sm outline-none" onChange={(event) => onQuickPatch(task, { dueDate: event.target.value })} type="date" value={task.dueDate} /></TableCell>
                  <TableCell>{task.dependencyIds?.length ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

type GanttInteraction = {
  taskId: string;
  mode: "move" | "start" | "end" | "reorder";
  originX: number;
  originY: number;
  currentOffsetX: number;
  currentOffsetY: number;
  startDate: string;
  dueDate: string;
  dayWidth: number;
  snapDays: number;
  originRowIndex: number;
  reorderRowIndex: number;
};

export function GanttView({ tasks, zoom, onZoomChange, onOpenTask, onUpdateTaskDates, onUpdateDependencies, ganttGranularity, ganttRangeDays, onGanttGranularityChange }: { tasks: TaskItem[]; zoom: GanttZoom; onZoomChange: (value: GanttZoom) => void; onOpenTask: (task: TaskItem) => void; onUpdateTaskDates: (taskId: string, startDate: string, dueDate: string) => void; onUpdateDependencies: (taskId: string, dependencyIds: string[]) => void; ganttGranularity: "day" | "week" | "month"; ganttRangeDays: number; onGanttGranularityChange: (value: "day" | "week" | "month") => void; }) {
  const interactionRef = useRef<GanttInteraction | null>(null);
  const [dragPreview, setDragPreview] = useState<{ taskId: string; mode: GanttInteraction["mode"]; offsetX: number; offsetY: number } | null>(null);
  const [linkSourceTaskId, setLinkSourceTaskId] = useState<string | null>(null);
  const [rowOrderIds, setRowOrderIds] = useState<string[]>(() => tasks.map((task) => task.id));
  const scale = ganttGranularity;
  const unitDays = scale === "day" ? 1 : scale === "week" ? 7 : 30;
  const rowHeight = zoom === "focus" ? 72 : zoom === "compact" ? 56 : 64;
  const barHeight = zoom === "focus" ? 44 : zoom === "compact" ? 34 : 40;
  const snapDays = scale === "day" ? 1 : scale === "week" ? 7 : 30;
  const dayWidth = {
    day: { compact: 54, balanced: 68, focus: 88 },
    week: { compact: 12, balanced: 15, focus: 18 },
    month: { compact: 4, balanced: 5, focus: 6 },
  }[scale][zoom];
  const normalizedRowOrderIds = useMemo(() => {
    const taskIds = tasks.map((task) => task.id);
    const preserved = rowOrderIds.filter((taskId) => taskIds.includes(taskId));
    const appended = taskIds.filter((taskId) => !preserved.includes(taskId));
    return [...preserved, ...appended];
  }, [rowOrderIds, tasks]);
  const orderedTasks = useMemo(() => {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    return normalizedRowOrderIds.map((taskId) => byId.get(taskId)).filter((task): task is TaskItem => Boolean(task));
  }, [normalizedRowOrderIds, tasks]);
  const deriveDraggedDates = (interaction: GanttInteraction) => {
    const deltaDays = Math.round(interaction.currentOffsetX / (interaction.dayWidth * interaction.snapDays)) * interaction.snapDays;
    const originalStart = parseDate(interaction.startDate);
    const originalDue = parseDate(interaction.dueDate);
    let nextStart = originalStart;
    let nextDue = originalDue;
    if (interaction.mode === "move") {
      nextStart = addDays(originalStart, deltaDays);
      nextDue = addDays(originalDue, deltaDays);
    } else if (interaction.mode === "start") {
      const candidate = addDays(originalStart, deltaDays);
      nextStart = candidate > originalDue ? originalDue : candidate;
    } else if (interaction.mode === "end") {
      const candidate = addDays(originalDue, deltaDays);
      nextDue = candidate < originalStart ? originalStart : candidate;
    }
    return { startDate: toDateValue(nextStart), dueDate: toDateValue(nextDue) };
  };

  const timelineStart = useMemo(() => {
    if (orderedTasks.length === 0) return scale === "month" ? startOfMonth(new Date()) : scale === "week" ? startOfWeek(new Date()) : startOfDay(new Date());
    const firstTaskDate = new Date(Math.min(...orderedTasks.map((task) => parseDate(task.startDate).getTime())));
    return scale === "month" ? startOfMonth(firstTaskDate) : scale === "week" ? startOfWeek(firstTaskDate) : startOfDay(firstTaskDate);
  }, [orderedTasks, scale]);

  const rangeUnits = Math.max(2, Math.ceil(ganttRangeDays / unitDays));
  const timelineUnits = useMemo(() => {
    const units: Array<{ start: Date; width: number; days: number }> = [];
    let cursor = timelineStart;
    for (let index = 0; index < rangeUnits; index += 1) {
      const next = scale === "month" ? addMonths(cursor, 1) : addDays(cursor, unitDays);
      const days = Math.max(1, differenceInDays(cursor, next));
      units.push({ start: cursor, width: days * dayWidth, days });
      cursor = next;
    }
    return units;
  }, [dayWidth, rangeUnits, scale, timelineStart, unitDays]);
  const totalDays = timelineUnits.reduce((sum, unit) => sum + unit.days, 0);
  const totalWidth = timelineUnits.reduce((sum, unit) => sum + unit.width, 0);
  const unitBoundaryOffsets = useMemo(() => {
    let offset = 0;
    return timelineUnits.slice(0, -1).map((unit) => {
      offset += unit.width;
      return offset;
    });
  }, [timelineUnits]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!interactionRef.current) return;
      const initialInteraction = interactionRef.current;
      const deltaX = event.clientX - initialInteraction.originX;
      const deltaY = event.clientY - initialInteraction.originY;
      if (initialInteraction.mode === "move" && Math.abs(deltaY) > 14 && Math.abs(deltaY) > Math.abs(deltaX)) {
        interactionRef.current = { ...initialInteraction, mode: "reorder", currentOffsetX: 0, currentOffsetY: 0 };
      }
      const currentInteraction = interactionRef.current;
      currentInteraction.currentOffsetX = deltaX;
      currentInteraction.currentOffsetY = deltaY;
      const { taskId, mode, originRowIndex, reorderRowIndex } = currentInteraction;
      if (mode === "reorder") {
        const nextRowIndex = Math.max(0, Math.min(orderedTasks.length - 1, originRowIndex + Math.round(deltaY / rowHeight)));
        if (nextRowIndex !== reorderRowIndex) interactionRef.current = { ...currentInteraction, reorderRowIndex: nextRowIndex };
        setDragPreview({ taskId, mode, offsetX: 0, offsetY: deltaY });
        return;
      }
      setDragPreview({ taskId, mode, offsetX: deltaX, offsetY: 0 });
    };

    const handleUp = () => {
      if (!interactionRef.current) return;
      const interaction = interactionRef.current;
      const { taskId, mode, originRowIndex, reorderRowIndex } = interaction;
      if (mode === "reorder") {
        if (originRowIndex !== reorderRowIndex) {
          setRowOrderIds(() => {
            const next = [...normalizedRowOrderIds];
            const [movedTaskId] = next.splice(originRowIndex, 1);
            next.splice(reorderRowIndex, 0, movedTaskId);
            return next;
          });
        }
        setDragPreview(null);
        interactionRef.current = null;
        return;
      }
      const preview = deriveDraggedDates(interaction);
      if (preview.startDate !== interaction.startDate || preview.dueDate !== interaction.dueDate) {
        onUpdateTaskDates(taskId, preview.startDate, preview.dueDate);
      }
      setDragPreview(null);
      interactionRef.current = null;
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [normalizedRowOrderIds, onUpdateTaskDates, orderedTasks.length, rowHeight]);

  const bars = orderedTasks.map((task, rowIndex) => {
    const startDate = task.startDate;
    const dueDate = task.dueDate;
    const startOffset = differenceInDays(timelineStart, parseDate(startDate));
    const duration = Math.max(1, differenceInDays(parseDate(startDate), addDays(parseDate(dueDate), 1)));
    return { task, rowIndex, left: ganttSidebarWidth + startOffset * dayWidth, width: Math.max(dayWidth, duration * dayWidth), startDate, dueDate };
  });

  const dependencyLines = orderedTasks.flatMap((task) => {
    const sourceBar = bars.find((bar) => bar.task.id === task.id);
    if (!sourceBar || !task.dependencyIds?.length) return [] as Array<{ path: string; id: string; startX: number; startY: number }>;
    return task.dependencyIds.flatMap((dependencyId) => {
      const dependencyBar = bars.find((bar) => bar.task.id === dependencyId);
      if (!dependencyBar) return [];
      const startX = dependencyBar.left + dependencyBar.width;
      const startY = ganttHeaderHeight + dependencyBar.rowIndex * rowHeight + rowHeight / 2;
      const endX = sourceBar.left;
      const endY = ganttHeaderHeight + sourceBar.rowIndex * rowHeight + rowHeight / 2;
      const elbowX = Math.max(startX + 28, (startX + endX) / 2);
      const arrowTargetX = endX - 10;
      return [{ id: `${dependencyId}-${task.id}`, startX, startY, path: `M ${startX} ${startY} H ${elbowX} V ${endY} H ${arrowTargetX}` }];
    });
  });

  return (
    <Card className="glass-surface border-0 overflow-hidden">
      <CardHeader className="flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs onValueChange={(value) => onGanttGranularityChange(value as "day" | "week" | "month")} value={ganttGranularity}>
            <TabsList>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs onValueChange={(value) => onZoomChange(value as GanttZoom)} value={zoom}>
            <TabsList>
              {GANTT_ZOOM_OPTIONS.map((option) => <TabsTrigger key={option.key} value={option.key}>{option.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {orderedTasks.length === 0 ? <EmptyStateCard description="Tasks with start and due dates will render as editable bars here." title="No timeline data yet" /> : <div className="rounded-[28px] bg-white/80 p-4 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]" onDragOver={(event) => { if (linkSourceTaskId) event.preventDefault(); }} onDrop={(event) => { if (!linkSourceTaskId) return; event.preventDefault(); onUpdateDependencies(linkSourceTaskId, []); setLinkSourceTaskId(null); }}>
          <div className="relative" style={{ minWidth: ganttSidebarWidth + totalWidth + 40 }}>
            <div className="grid" style={{ gridTemplateColumns: `${ganttSidebarWidth}px ${timelineUnits.map((unit) => `${unit.width}px`).join(" ")}` }}>
              <div className="sticky left-0 z-10 bg-white/90 px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">Tasks</div>
              {timelineUnits.map((unit) => <div className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground" key={unit.start.toISOString()}>{scale === "month" ? formatDate(unit.start, { month: "short", year: "numeric" }) : formatDate(unit.start, { month: "short", day: "numeric" })}</div>)}
            </div>

            <div className="absolute inset-x-0 top-[52px] h-px bg-slate-200" />
            <svg className="pointer-events-none absolute inset-0" height={ganttHeaderHeight + bars.length * rowHeight + 20} width={ganttSidebarWidth + totalWidth + 40}>
              <defs>
                <marker id="gantt-dependency-arrow" markerHeight="6" markerUnits="userSpaceOnUse" markerWidth="6" orient="auto" refX="5" refY="3">
                  <path d="M0,0 L6,3 L0,6 z" fill="rgba(72,101,211,0.72)" />
                </marker>
              </defs>
              {dependencyLines.map((line) => (
                <g key={line.id}>
                  <path d={line.path} fill="none" markerEnd="url(#gantt-dependency-arrow)" stroke="rgba(72,101,211,0.52)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
                </g>
              ))}
              <line stroke="rgba(244,63,94,0.26)" strokeWidth="2" x1={ganttSidebarWidth + differenceInDays(timelineStart, startOfDay(new Date())) * dayWidth} x2={ganttSidebarWidth + differenceInDays(timelineStart, startOfDay(new Date())) * dayWidth} y1={ganttHeaderHeight} y2={ganttHeaderHeight + bars.length * rowHeight} />
            </svg>

            <div className="mt-2">
              {bars.map((bar) => {
                const activePreview = dragPreview?.taskId === bar.task.id ? dragPreview : null;
                let previewLeft = bar.left - ganttSidebarWidth;
                let previewWidth = bar.width;
                if (activePreview?.mode === "move") {
                  previewLeft += activePreview.offsetX;
                } else if (activePreview?.mode === "start") {
                  const maxShrink = Math.max(0, bar.width - dayWidth);
                  const effectiveOffset = activePreview.offsetX > maxShrink ? maxShrink : activePreview.offsetX;
                  previewLeft += effectiveOffset;
                  previewWidth -= effectiveOffset;
                } else if (activePreview?.mode === "end") {
                  previewWidth = Math.max(dayWidth, bar.width + activePreview.offsetX);
                }
                return (
                <div className="grid border-b border-slate-100" key={bar.task.id} style={{ gridTemplateColumns: `${ganttSidebarWidth}px 1fr`, minHeight: rowHeight, position: activePreview?.mode === "reorder" ? "relative" : undefined, transform: activePreview?.mode === "reorder" ? `translateY(${activePreview.offsetY}px)` : undefined, zIndex: activePreview?.mode === "reorder" ? 20 : undefined }}>
                  <button className="sticky left-0 z-10 flex items-center rounded-[18px] bg-slate-50/90 px-4 py-3 text-left transition hover:bg-slate-100" onClick={() => onOpenTask(bar.task)} type="button">
                    <div className="flex min-w-0 items-center gap-3 text-sm">
                      <span className="truncate font-semibold text-foreground">{bar.task.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDateFromValue(bar.startDate, { month: "short", day: "numeric" })} - {formatDateFromValue(bar.dueDate, { month: "short", day: "numeric" })}</span>
                    </div>
                  </button>
                  <div className="relative" style={{ width: totalWidth }} onDragOver={(event) => { if (linkSourceTaskId) event.preventDefault(); }} onDrop={(event) => { const sourceId = event.dataTransfer.getData("text/gantt-dependency-source"); if (!sourceId) return; event.preventDefault(); event.stopPropagation(); onUpdateDependencies(sourceId, sourceId === bar.task.id ? [] : [bar.task.id]); setLinkSourceTaskId(null); }}>
                    {Array.from({ length: totalDays }, (_, index) => <div className="absolute inset-y-0 border-l border-slate-100" key={`${bar.task.id}-${index}`} style={{ left: index * dayWidth }} />)}
                    {unitBoundaryOffsets.map((offset) => <div className="absolute inset-y-0 w-px bg-slate-200" key={`${bar.task.id}-boundary-${offset}`} style={{ left: offset }} />)}
                    <button className={cn("group absolute cursor-default rounded-full px-4 text-left shadow-[0_12px_24px_rgba(43,75,185,0.10)] transition hover:scale-[1.01]", activePreview && "shadow-[0_18px_32px_rgba(43,75,185,0.18)]", bar.task.status === "progress" && "bg-[linear-gradient(135deg,#2b4bb9,#4865d3)] text-white", bar.task.status === "review" && "bg-[linear-gradient(135deg,#fef3c7,#fde68a)] text-amber-900", bar.task.status === "done" && "bg-[linear-gradient(135deg,#dcfce7,#bbf7d0)] text-emerald-900", bar.task.status === "todo" && "bg-[linear-gradient(135deg,#dbe6ff,#eff4ff)] text-slate-800", bar.task.blocked && "ring-2 ring-rose-300")} onDoubleClick={() => onOpenTask(bar.task)} style={{ left: previewLeft, top: Math.max(8, (rowHeight - barHeight) / 2), width: previewWidth, height: barHeight, opacity: activePreview?.mode === "reorder" ? 0.96 : 1 }} type="button">
                      <span className="absolute left-0 top-0 z-20 h-full w-3 cursor-col-resize" onPointerDown={(event) => { event.stopPropagation(); interactionRef.current = { taskId: bar.task.id, mode: "start", originX: event.clientX, originY: event.clientY, currentOffsetX: 0, currentOffsetY: 0, originRowIndex: bar.rowIndex, reorderRowIndex: bar.rowIndex, startDate: bar.startDate, dueDate: bar.dueDate, dayWidth, snapDays }; }} />
                      <span className="absolute right-4 top-0 z-20 h-full w-3 cursor-col-resize" onPointerDown={(event) => { event.stopPropagation(); interactionRef.current = { taskId: bar.task.id, mode: "end", originX: event.clientX, originY: event.clientY, currentOffsetX: 0, currentOffsetY: 0, originRowIndex: bar.rowIndex, reorderRowIndex: bar.rowIndex, startDate: bar.startDate, dueDate: bar.dueDate, dayWidth, snapDays }; }} />
                      <span className="absolute inset-y-0 left-3 right-4 z-10 cursor-grab rounded-full active:cursor-grabbing" onPointerDown={(event) => { interactionRef.current = { taskId: bar.task.id, mode: "move", originX: event.clientX, originY: event.clientY, currentOffsetX: 0, currentOffsetY: 0, originRowIndex: bar.rowIndex, reorderRowIndex: bar.rowIndex, startDate: bar.startDate, dueDate: bar.dueDate, dayWidth, snapDays }; }} />
                      <span className={cn("absolute right-0 top-0 z-20 h-full w-4 cursor-alias rounded-r-full opacity-0 transition-opacity group-hover:opacity-100", linkSourceTaskId === bar.task.id ? "bg-white/55 opacity-100" : "bg-white/28")} draggable onDragEnd={() => setLinkSourceTaskId(null)} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/gantt-dependency-source", bar.task.id); setLinkSourceTaskId(bar.task.id); }} />
                      <div className="relative flex h-full items-center justify-between gap-3 overflow-hidden text-xs font-semibold"><span className="truncate">{bar.task.title}</span>{bar.width >= 110 ? <span className="shrink-0">{bar.task.progress}%</span> : null}</div>
                    </button>
                  </div>
                </div>
              );})}
            </div>
          </div>
        </div>}
      </CardContent>
    </Card>
  );
}

function eventCanEdit(event: AgendaEvent) {
  return !event.readonly && event.source !== "external" && event.source !== "ics";
}

function moveEventToDay(event: AgendaEvent, day: Date) {
  const start = parseDate(event.start);
  const end = parseDate(event.end);
  const nextStart = new Date(day);
  nextStart.setHours(start.getHours(), start.getMinutes(), 0, 0);
  const duration = Math.max(30, differenceInMinutes(start, end));
  return {
    start: toDateTimeLocalValue(nextStart),
    end: toDateTimeLocalValue(addMinutes(nextStart, duration)),
  };
}

function weekColumns(selectedDay: Date, mode: CalendarViewMode) {
  if (mode === "day") return [selectedDay];
  const weekStart = startOfWeek(selectedDay);
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

type MonthCellItem = { id: string; kind: "event"; title: string; event: AgendaEvent };

function buildMonthCellItems(events: AgendaEvent[]): MonthCellItem[] {
  return events.map((event) => ({ id: event.id, kind: "event" as const, title: event.title, event }));
}

export function CalendarView({ monthCursor, monthGrid, calendarViewMode, onCalendarViewModeChange, events, externalEvents, selectedDay, onSelectDay, onMonthChange, onEditEvent, onCreateEvent, onMoveEvent, onResizeEvent }: { monthCursor: Date; monthGrid: Date[]; calendarViewMode: CalendarViewMode; onCalendarViewModeChange: (value: CalendarViewMode) => void; events: AgendaEvent[]; externalEvents: AgendaEvent[]; selectedDay: Date; onSelectDay: (value: Date) => void; onMonthChange: (value: Date) => void; onEditEvent?: (event?: AgendaEvent) => void; onCreateEvent?: (day: Date) => void; onMoveEvent?: (event: AgendaEvent, nextStart: string, nextEnd: string) => void; onResizeEvent?: (event: AgendaEvent, nextEnd: string) => void; }) {
  const timelineColumns = useMemo(() => weekColumns(selectedDay, calendarViewMode), [calendarViewMode, selectedDay]);
  const visibleRangeStart = calendarViewMode === "month" ? monthGrid[0] : startOfDay(timelineColumns[0]);
  const visibleRangeEnd = calendarViewMode === "month" ? monthGrid[monthGrid.length - 1] : endOfDay(timelineColumns[timelineColumns.length - 1]);
  const expandedEvents = useMemo(
    () => expandRecurringEvents(events, visibleRangeStart, visibleRangeEnd),
    [events, visibleRangeEnd, visibleRangeStart],
  );
  const expandedExternalEvents = useMemo(
    () => expandRecurringEvents(externalEvents, visibleRangeStart, visibleRangeEnd),
    [externalEvents, visibleRangeEnd, visibleRangeStart],
  );
  const mergedEvents = [...expandedEvents, ...expandedExternalEvents].sort((left, right) => left.start.localeCompare(right.start));
  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, AgendaEvent[]>();
    for (const event of mergedEvents) {
      const key = toDateValue(parseDate(event.start));
      const bucket = grouped.get(key);
      if (bucket) bucket.push(event);
      else grouped.set(key, [event]);
    }
    return grouped;
  }, [mergedEvents]);
  const selectedDayKey = toDateValue(selectedDay);
  const selectedEvents = eventsByDay.get(selectedDayKey) ?? [];
  const dragRef = useRef<{ event: AgendaEvent; mode: "move" | "resize"; originX: number; originY: number; start: string; end: string } | null>(null);
  const timelineGridRef = useRef<HTMLDivElement | null>(null);
  const [previewTimes, setPreviewTimes] = useState<Record<string, { start: string; end: string }>>({});
  const [openOverflowDayKey, setOpenOverflowDayKey] = useState<string | null>(null);
  const [timelineColumnWidth, setTimelineColumnWidth] = useState(calendarColumnMinWidth);
  const totalMonthRows = Math.ceil(monthGrid.length / 7);
  const visibleOverflowDayKey = calendarViewMode === "month" && monthGrid.some((day) => toDateValue(day) === openOverflowDayKey)
    ? openOverflowDayKey
    : null;

  useEffect(() => {
    const resetId = window.setTimeout(() => setPreviewTimes({}), 0);
    return () => window.clearTimeout(resetId);
  }, [calendarViewMode, monthCursor, selectedDay]);

  useEffect(() => {
    if (calendarViewMode === "month") return undefined;
    const node = timelineGridRef.current;
    if (!node) return undefined;

    const updateMetrics = () => {
      const nextWidth = (node.scrollWidth - calendarLabelColumnWidth) / Math.max(1, timelineColumns.length);
      if (Number.isFinite(nextWidth) && nextWidth > 0) setTimelineColumnWidth(nextWidth);
    };

    updateMetrics();
    const observer = new ResizeObserver(updateMetrics);
    observer.observe(node);
    return () => observer.disconnect();
  }, [calendarViewMode, timelineColumns.length]);

  useEffect(() => {
    if (!visibleOverflowDayKey) return undefined;

    const handlePointerDown = (pointerEvent: PointerEvent) => {
      const target = pointerEvent.target;
      if (target instanceof HTMLElement && target.closest("[data-month-overflow-root='true']")) return;
      setOpenOverflowDayKey(null);
    };

    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") setOpenOverflowDayKey(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [visibleOverflowDayKey]);

  useEffect(() => {
    const handleMove = (pointerEvent: PointerEvent) => {
      if (!dragRef.current || calendarViewMode === "month") return;
      const { event, mode, originY, start, end } = dragRef.current;
      const deltaMinutes = Math.round((pointerEvent.clientY - originY) / (calendarHourHeight / 60) / 15) * 15;
      const startDate = parseDate(start);
      const endDate = parseDate(end);
      if (mode === "move") {
        const nextStart = addMinutes(startDate, deltaMinutes);
        const nextEnd = addMinutes(endDate, deltaMinutes);
        setPreviewTimes((current) => ({ ...current, [event.id]: { start: toDateTimeLocalValue(nextStart), end: toDateTimeLocalValue(nextEnd) } }));
      } else {
        const minimumEnd = addMinutes(startDate, 30);
        const candidateEnd = addMinutes(endDate, deltaMinutes);
        const nextEnd = candidateEnd < minimumEnd ? minimumEnd : candidateEnd;
        setPreviewTimes((current) => ({ ...current, [event.id]: { start, end: toDateTimeLocalValue(nextEnd) } }));
      }
    };

    const handleUp = () => {
      if (!dragRef.current) return;
      const { event, mode } = dragRef.current;
      const preview = previewTimes[event.id];
      if (preview) {
        if (mode === "move") onMoveEvent?.(event, preview.start, preview.end);
        else onResizeEvent?.(event, preview.end);
      }
      dragRef.current = null;
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [calendarViewMode, onMoveEvent, onResizeEvent, previewTimes]);

  return (
    <Card className="glass-surface border-0 overflow-hidden">
      <CardHeader className="flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs onValueChange={(value) => onCalendarViewModeChange(value as CalendarViewMode)} value={calendarViewMode}>
            <TabsList>
              {CALENDAR_VIEW_OPTIONS.map((mode) => <TabsTrigger key={mode} value={mode}>{mode}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2 rounded-full bg-white/80 p-1 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]">
            <Button onClick={() => onMonthChange(addMonths(monthCursor, -1))} size="icon-sm" variant="ghost"><ArrowLeft className="size-4" /></Button>
            <span className="px-4 text-sm font-semibold">{formatDate(monthCursor, { month: "long", year: "numeric" })}</span>
            <Button onClick={() => onMonthChange(addMonths(monthCursor, 1))} size="icon-sm" variant="ghost"><ArrowRight className="size-4" /></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {calendarViewMode === "month" ? (
          <>
            <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day}>{day}</div>)}</div>
            <div className="grid grid-cols-7 gap-2">
              {monthGrid.map((day, dayIndex) => {
                const dayKey = toDateValue(day);
                const dayEvents = eventsByDay.get(dayKey) ?? [];
                const dayItems = buildMonthCellItems(dayEvents);
                const visibleItems = dayItems.slice(0, monthCellVisibleItems);
                const hiddenItemCount = Math.max(0, dayItems.length - visibleItems.length);
                const isSelected = isSameDay(day, selectedDay);
                const isOverflowOpen = visibleOverflowDayKey === dayKey;
                const rowIndex = Math.floor(dayIndex / 7);
                const overflowOpensAbove = rowIndex >= totalMonthRows - 2;
                const overflowAlignRight = dayIndex % 7 >= 4;
                return (
                  <div aria-label={`${formatDate(day, { month: "long", day: "numeric" })} calendar cell`} className={cn("calendar-cell min-h-[92px] rounded-[16px] p-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30", isSelected && "ring-2 ring-primary/30", !isSameMonth(day, monthCursor) && "opacity-40")} key={day.toISOString()} onClick={() => onSelectDay(day)} onDoubleClick={() => onCreateEvent?.(day)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                    event.preventDefault();
                    const eventId = event.dataTransfer.getData("text/calendar-event-id");
                    const moved = mergedEvents.find((item) => item.id === eventId);
                    if (moved && eventCanEdit(moved)) {
                      const nextTimes = moveEventToDay(moved, day);
                      onMoveEvent?.(moved, nextTimes.start, nextTimes.end);
                    }
                  }} onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectDay(day);
                    }
                  }} role="button" tabIndex={0}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className={cn("text-[12px] font-semibold leading-none", isSelected && "text-primary")}>{day.getDate()}</span>
                      {dayItems.length > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                    </div>
                    <div className="space-y-0.5">
                      {visibleItems.map((item) => (
                        <div className={cn("truncate rounded-md px-1.5 py-1 text-[10px] font-medium leading-tight", eventCanEdit(item.event) ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600")} draggable={eventCanEdit(item.event)} key={`event-${item.id}`} onClick={(clickEvent) => { clickEvent.stopPropagation(); if (eventCanEdit(item.event)) onEditEvent?.(item.event); }} onDragStart={(dragEvent) => dragEvent.dataTransfer.setData("text/calendar-event-id", item.event.id)}>
                          {item.title}
                        </div>
                      ))}
                      {hiddenItemCount > 0 ? (
                        <div className="relative pt-0.5" data-month-overflow-root="true">
                          <button className="px-1 text-[10px] font-semibold text-muted-foreground transition hover:text-foreground" onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            onSelectDay(day);
                            setOpenOverflowDayKey((current) => current === dayKey ? null : dayKey);
                          }} type="button">
                            +{hiddenItemCount} more
                          </button>
                          {isOverflowOpen ? (
                            <div className={cn("absolute z-20 w-[280px] rounded-[16px] border border-slate-200/80 bg-white/98 p-3 shadow-[0_16px_36px_rgba(43,75,185,0.16)] backdrop-blur-xl sm:w-[320px]", overflowAlignRight ? "right-0" : "left-0", overflowOpensAbove ? "bottom-full mb-1.5" : "top-full mt-1.5")}>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">All items</p>
                                <span className="text-[10px] text-muted-foreground">{dayItems.length}</span>
                              </div>
                              <div className="max-h-52 space-y-1.5 overflow-y-auto pr-0.5">
                                {dayItems.map((item) => (
                                  <div className={cn("rounded-xl px-3 py-2 text-left", eventCanEdit(item.event) ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-700")} key={`overflow-event-${item.id}`} onClick={(clickEvent) => {
                                    clickEvent.stopPropagation();
                                    onSelectDay(day);
                                    if (eventCanEdit(item.event)) onEditEvent?.(item.event);
                                  }} role="button" tabIndex={0} onKeyDown={(keyboardEvent) => {
                                    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                                      keyboardEvent.preventDefault();
                                      onSelectDay(day);
                                      if (eventCanEdit(item.event)) onEditEvent?.(item.event);
                                    }
                                  }}>
                                    <p className="truncate text-[11px] font-semibold leading-4">{item.title}</p>
                                    <p className="text-[10px] opacity-80">{formatDate(parseDate(item.event.start), { hour: "numeric", minute: "2-digit" })} - {formatDate(parseDate(item.event.end), { hour: "numeric", minute: "2-digit" })}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="overflow-x-auto rounded-[28px] bg-white/80 p-4 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]">
            <div className="relative grid" ref={timelineGridRef} style={{ gridTemplateColumns: `${calendarLabelColumnWidth}px repeat(${timelineColumns.length}, minmax(${calendarColumnMinWidth}px, 1fr))` }}>
              <div className="h-[52px]" />
              {timelineColumns.map((day) => (
                <button className={cn("h-[52px] rounded-[18px] px-3 py-2 text-left", isSameDay(day, selectedDay) && "bg-slate-100")} key={day.toISOString()} onClick={() => onSelectDay(day)} type="button">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{formatDate(day, { weekday: "short" })}</p>
                  <p className="text-sm font-semibold">{formatDate(day, { month: "short", day: "numeric" })}</p>
                </button>
              ))}
              {calendarHours.map((hour) => (
                <Fragment key={`hour-row-${hour}`}>
                  <div className="flex h-[56px] items-start border-t border-slate-100 py-3 text-xs text-muted-foreground">{`${String(hour).padStart(2, "0")}:00`}</div>
                  {timelineColumns.map((day) => (
                    <div className="relative h-[56px] border-t border-l border-slate-100 first:border-l-0" key={`${day.toISOString()}-${hour}`} onDoubleClick={() => onCreateEvent?.(day)} />
                  ))}
                </Fragment>
              ))}
              <div className="pointer-events-none absolute inset-0">
                {mergedEvents.filter((event) => {
                  const eventDay = timelineColumns.findIndex((day) => isSameDay(parseDate(event.start), day));
                  return eventDay > -1;
                }).map((event) => {
                  const preview = previewTimes[event.id];
                  const start = parseDate(preview?.start ?? event.start);
                  const end = parseDate(preview?.end ?? event.end);
                  const dayIndex = timelineColumns.findIndex((day) => isSameDay(start, day));
                  if (dayIndex === -1) return null;
                  const top = ((start.getHours() - calendarHours[0]) * 60 + start.getMinutes()) * (calendarHourHeight / 60) + calendarHeaderHeight;
                  const height = Math.max(28, differenceInMinutes(start, end) * (calendarHourHeight / 60));
                  return (
                    <div className={cn("pointer-events-auto absolute rounded-[18px] px-3 py-2 text-xs shadow-[0_12px_24px_rgba(43,75,185,0.12)]", eventCanEdit(event) ? "bg-[linear-gradient(135deg,#fff7d1,#ffe8a3)] text-amber-900" : "bg-slate-100 text-slate-600")} key={event.id} style={{ left: calendarLabelColumnWidth + dayIndex * timelineColumnWidth + 8, top, width: Math.max(140, timelineColumnWidth - 16), height }}>
                      {eventCanEdit(event) ? <button className="absolute inset-0 cursor-grab active:cursor-grabbing" onPointerDown={(pointerEvent) => { dragRef.current = { event, mode: "move", originX: pointerEvent.clientX, originY: pointerEvent.clientY, start: preview?.start ?? event.start, end: preview?.end ?? event.end }; }} type="button" /> : null}
                      {eventCanEdit(event) ? <button className="absolute inset-x-4 bottom-1 h-2 cursor-ns-resize rounded-full bg-black/10" onPointerDown={(pointerEvent) => { pointerEvent.stopPropagation(); dragRef.current = { event, mode: "resize", originX: pointerEvent.clientX, originY: pointerEvent.clientY, start: preview?.start ?? event.start, end: preview?.end ?? event.end }; }} type="button" /> : null}
                      <div className="relative flex h-full flex-col justify-between">
                        <div>
                          <p className="font-semibold">{event.title}</p>
                          <p className="text-[11px] opacity-80">{formatDate(start, { hour: "numeric", minute: "2-digit" })} - {formatDate(end, { hour: "numeric", minute: "2-digit" })}</p>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <Badge className={cn("rounded-full border-0", EVENT_TYPE_META[event.type] ?? "bg-slate-100 text-slate-600")}>{event.type}</Badge>
                          {event.source === "external" || event.source === "ics" ? <span className="text-[10px] uppercase tracking-[0.18em]">read-only</span> : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="rounded-[20px] bg-white/80 p-3 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Selected day</p>
              <p className="truncate text-sm text-foreground">{formatDate(selectedDay, { month: "long", day: "numeric", weekday: "long" })}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{selectedEvents.length} event(s)</Badge>
            </div>
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {selectedEvents.length > 0 ? selectedEvents.map((event) => (
              <button className="flex w-full items-center justify-between gap-3 rounded-[14px] bg-slate-50 px-3 py-2 text-left shadow-[inset_0_0_0_1px_rgba(195,198,215,0.24)]" key={event.id} onClick={() => eventCanEdit(event) ? onEditEvent?.(event) : undefined} type="button">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{event.title} · {formatDate(parseDate(event.start), { hour: "numeric", minute: "2-digit" })} - {formatDate(parseDate(event.end), { hour: "numeric", minute: "2-digit" })}</p>
                </div>
                <Badge className={cn("rounded-full border-0 px-2 py-0.5 text-[10px]", EVENT_TYPE_META[event.type] ?? "bg-slate-100 text-slate-600")}>{event.type}</Badge>
              </button>
            )) : <EmptyStateCard description="Double-click a date or use the compact action button to add a simple event." title="No events on this date" />}
          </div>
          {onCreateEvent ? <div className="mt-3 flex justify-end"><Button onClick={() => onCreateEvent(selectedDay)} size="sm"><Plus className="size-4" />Add event</Button></div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function WhiteboardView({ canEdit, scene, onSceneChange }: { canEdit: boolean; scene?: WhiteboardScene; onSceneChange?: (scene: WhiteboardScene, reason?: "auto" | "manual") => void | Promise<void>; }) {
  return (
    <Card className="glass-surface border-0 overflow-hidden">
      <CardContent>
        <WhiteboardCanvas canEdit={canEdit} onSceneChange={onSceneChange} scene={scene} />
      </CardContent>
    </Card>
  );
}

export function AgendaCard({ event, onEdit, canEdit }: { event: AgendaEvent; onEdit?: (event?: AgendaEvent) => void; canEdit: boolean; }) {
  return (
    <div className="rounded-[22px] bg-white/85 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          <Badge className={cn("rounded-full border-0", EVENT_TYPE_META[event.type] ?? "bg-slate-100 text-slate-600")}>{event.type}</Badge>
        </div>
        {canEdit && !event.readonly ? <Button onClick={() => onEdit?.(event)} size="icon-sm" variant="ghost"><Sparkles className="size-4" /></Button> : null}
      </div>
      <p className="font-heading text-xl font-bold tracking-tight">{event.title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{formatDate(parseDate(event.start), { hour: "numeric", minute: "2-digit" })} - {formatDate(parseDate(event.end), { hour: "numeric", minute: "2-digit" })}</p>
      {event.description ? <p className="mt-2 text-sm text-muted-foreground">{event.description}</p> : null}
      {event.location ? <p className="mt-1 text-sm text-muted-foreground">{event.location}</p> : null}
      {event.link ? <a className="mt-3 inline-flex text-sm font-semibold text-primary" href={event.link} rel="noreferrer" target="_blank">Open link</a> : null}
    </div>
  );
}
