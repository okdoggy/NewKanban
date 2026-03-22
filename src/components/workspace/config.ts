import type {
  CalendarViewMode,
  DecisionSection,
  EventDraft,
  GanttZoom,
  MemberRole,
  NoteDraft,
  TaskDraft,
  TaskPriority,
  TaskStatus,
  ViewKey,
  WorkspaceAutomation,
} from "@/lib/types";
import {
  CalendarDays,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  ListTodo,
  PanelsTopLeft,
} from "lucide-react";

export const PALETTE = ["#2b4bb9", "#4865d3", "#0ea5e9", "#14b8a6", "#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444", "#ec4899", "#d946ef", "#8b5cf6", "#6366f1", "#64748b", "#111827"];
export const STATUS_ORDER: TaskStatus[] = ["todo", "progress", "review", "done"];
export const VIEWS: Array<{ key: ViewKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: "home", label: "Home", icon: LayoutDashboard },
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "my-work", label: "My Work", icon: ListTodo },
  { key: "projects", label: "Projects", icon: FolderKanban },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "collaborate", label: "Collaborate", icon: PanelsTopLeft },
];

export const statusMeta: Record<TaskStatus, { label: string; dot: string; badgeClassName: string; minProgress: number }> = {
  todo: { label: "To do", dot: "bg-slate-400", badgeClassName: "bg-slate-100 text-slate-600", minProgress: 0 },
  progress: { label: "In progress", dot: "bg-blue-600", badgeClassName: "bg-blue-100 text-blue-700", minProgress: 25 },
  review: { label: "Review", dot: "bg-amber-500", badgeClassName: "bg-amber-100 text-amber-700", minProgress: 75 },
  done: { label: "Done", dot: "bg-emerald-500", badgeClassName: "bg-emerald-100 text-emerald-700", minProgress: 100 },
};

export const priorityMeta: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-indigo-100 text-indigo-700",
  high: "bg-rose-100 text-rose-700",
};

export const roleMeta: Record<MemberRole, string> = {
  owner: "bg-emerald-100 text-emerald-700",
  editor: "bg-blue-100 text-blue-700",
  viewer: "bg-slate-100 text-slate-600",
};

export const NOTE_COLOR_OPTIONS = ["#ffffff", "#4865d3", "#fff0a8", "#dfe7ff", "#c8facc", "#ffe0b6"];
export const EVENT_TYPE_OPTIONS = ["Team", "Group", "Part", "TG", "Project1", "Project2", "Project3", "Personal", "Etc"] as const;
export const EVENT_TYPE_META: Record<string, string> = {
  Team: "bg-blue-100 text-blue-700",
  Group: "bg-violet-100 text-violet-700",
  Part: "bg-amber-100 text-amber-700",
  TG: "bg-emerald-100 text-emerald-700",
  Project1: "bg-sky-100 text-sky-700",
  Project2: "bg-indigo-100 text-indigo-700",
  Project3: "bg-fuchsia-100 text-fuchsia-700",
  Personal: "bg-slate-100 text-slate-600",
  Etc: "bg-orange-100 text-orange-700",
  planning: "bg-blue-100 text-blue-700",
  milestone: "bg-violet-100 text-violet-700",
  verification: "bg-amber-100 text-amber-700",
  ongoing: "bg-emerald-100 text-emerald-700",
  upcoming: "bg-sky-100 text-sky-700",
  afternoon: "bg-orange-100 text-orange-700",
  focus: "bg-fuchsia-100 text-fuchsia-700",
  external: "bg-slate-100 text-slate-600",
};

export const DECISION_SECTIONS: Array<{ key: DecisionSection; label: string; hint: string }> = [
  { key: "ideas", label: "Ideas", hint: "Raw options and opportunities" },
  { key: "questions", label: "Questions", hint: "Open unknowns to resolve" },
  { key: "risks", label: "Risks", hint: "Dependencies, blockers, or concerns" },
  { key: "decisions", label: "Decisions", hint: "Agreed direction and owners" },
  { key: "actions", label: "Actions", hint: "Follow-up work ready to execute" },
];

export const CALENDAR_VIEW_OPTIONS: CalendarViewMode[] = ["month", "week", "day"];
export const GANTT_ZOOM_OPTIONS: Array<{ key: GanttZoom; label: string; cellWidth: number }> = [
  { key: "compact", label: "Compact", cellWidth: 92 },
  { key: "balanced", label: "Balanced", cellWidth: 120 },
  { key: "focus", label: "Focus", cellWidth: 156 },
];
export const WIP_LIMITS: Record<TaskStatus, number> = {
  todo: 6,
  progress: 4,
  review: 3,
  done: 99,
};

export const DEFAULT_AUTOMATION: WorkspaceAutomation = {
  progressCompletesTask: true,
  statusSetsProgress: true,
  dueDateCreatesAgendaHold: false,
};

export const RECURRENCE_OPTIONS: Array<{ value: EventDraft["recurrence"]; label: string }> = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];

export function createTaskDraft(): TaskDraft {
  return {
    title: "",
    description: "",
    status: "todo",
    priority: "medium",
    label: "Product",
    startDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };
}

export function createNoteDraft(): NoteDraft {
  return {
    title: "",
    content: "",
    tag: "Idea",
    color: "#ffffff",
    section: "ideas" as DecisionSection,
  };
}

export function createEventDraft(seedDate: Date, relatedTaskId = ""): EventDraft {
  const start = new Date(seedDate);
  start.setHours(10, 0, 0, 0);
  const end = new Date(seedDate);
  end.setHours(11, 0, 0, 0);

  return {
    title: "",
    start: start.toISOString().slice(0, 16),
    end: end.toISOString().slice(0, 16),
    type: "Team",
    description: "",
    location: "",
    link: "",
    relatedTaskId,
    recurrence: "none",
  };
}
