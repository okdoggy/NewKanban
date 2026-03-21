"use client";

import { useEffect, useMemo, useState } from "react";

import { parseDate } from "@/lib/date-utils";
import type { CalendarViewMode, GanttZoom, ViewKey } from "@/lib/types";
import { VIEWS } from "@/components/workspace/config";
import type { TaskPriorityFilter, TaskSortMode, TaskStatusFilter } from "@/components/workspace/task-utils";

export interface SerializedWorkspaceQueryState {
  view: ViewKey;
  search: string;
  boardMode: "board" | "list";
  calendarViewMode: CalendarViewMode;
  ganttZoom: GanttZoom;
  selectedDay: Date;
  statusFilter: TaskStatusFilter;
  priorityFilter: TaskPriorityFilter;
  sortMode: TaskSortMode;
}

type LegacyViewKey = "overview" | "kanban" | "gantt" | "whiteboard";

function normalizeViewKey(view: string | null | undefined): ViewKey {
  if (!view) return "home";
  if (VIEWS.some((item) => item.key === view)) return view as ViewKey;
  if ((view as LegacyViewKey) === "overview") return "home";
  if ((view as LegacyViewKey) === "kanban" || (view as LegacyViewKey) === "gantt") return "projects";
  if ((view as LegacyViewKey) === "whiteboard") return "collaborate";
  return "home";
}

function readInitialQueryState(): SerializedWorkspaceQueryState {
  if (typeof window === "undefined") {
    return {
      view: "home",
      search: "",
      boardMode: "board",
      calendarViewMode: "month",
      ganttZoom: "balanced",
      selectedDay: new Date(),
      statusFilter: "all",
      priorityFilter: "all",
      sortMode: "due-asc",
    };
  }

  const params = new URLSearchParams(window.location.search);
  const initialView = params.get("view");
  const initialSearch = params.get("q") ?? "";
  const initialBoard = params.get("board");
  const initialCalendarMode = params.get("calendar");
  const initialZoom = params.get("zoom");
  const initialDay = params.get("day");
  const initialStatus = params.get("status");
  const initialPriority = params.get("priority");
  const initialSort = params.get("sort");

  const selectedDay = initialDay ? parseDate(initialDay) : new Date();

  return {
    view: normalizeViewKey(initialView),
    search: initialSearch,
    boardMode: initialBoard === "list" || initialBoard === "board" ? initialBoard : "board",
    calendarViewMode:
      initialCalendarMode === "day" || initialCalendarMode === "week" || initialCalendarMode === "month"
        ? (initialCalendarMode as CalendarViewMode)
        : "month",
    ganttZoom: initialZoom === "compact" || initialZoom === "focus" || initialZoom === "balanced" ? (initialZoom as GanttZoom) : "balanced",
    selectedDay: !Number.isNaN(selectedDay.getTime()) ? selectedDay : new Date(),
    statusFilter: initialStatus && ["all", "todo", "progress", "review", "done"].includes(initialStatus) ? (initialStatus as TaskStatusFilter) : "all",
    priorityFilter: initialPriority && ["all", "low", "medium", "high"].includes(initialPriority) ? (initialPriority as TaskPriorityFilter) : "all",
    sortMode: initialSort && ["due-asc", "due-desc", "updated-desc", "priority-desc"].includes(initialSort) ? (initialSort as TaskSortMode) : "due-asc",
  };
}

export function useWorkspaceQueryState() {
  const initialState = readInitialQueryState();
  const [view, setView] = useState<ViewKey>(initialState.view);
  const [search, setSearch] = useState(initialState.search);
  const [boardMode, setBoardMode] = useState<"board" | "list">(initialState.boardMode);
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>(initialState.calendarViewMode);
  const [ganttZoom, setGanttZoom] = useState<GanttZoom>(initialState.ganttZoom);
  const [selectedDay, setSelectedDay] = useState(initialState.selectedDay);
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>(initialState.statusFilter);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriorityFilter>(initialState.priorityFilter);
  const [sortMode, setSortMode] = useState<TaskSortMode>(initialState.sortMode);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("view", view);
    if (search.trim()) params.set("q", search.trim());
    else params.delete("q");
    if (boardMode !== "board") params.set("board", boardMode);
    else params.delete("board");
    if (calendarViewMode !== "month") params.set("calendar", calendarViewMode);
    else params.delete("calendar");
    if (ganttZoom !== "balanced") params.set("zoom", ganttZoom);
    else params.delete("zoom");
    if (view === "calendar") params.set("day", selectedDay.toISOString().slice(0, 10));
    else params.delete("day");
    if (statusFilter !== "all") params.set("status", statusFilter);
    else params.delete("status");
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    else params.delete("priority");
    if (sortMode !== "due-asc") params.set("sort", sortMode);
    else params.delete("sort");
    const next = params.toString();
    const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, [boardMode, calendarViewMode, ganttZoom, priorityFilter, search, selectedDay, sortMode, statusFilter, view]);

  const hasActiveFilters = useMemo(
    () => Boolean(search.trim()) || statusFilter !== "all" || priorityFilter !== "all" || sortMode !== "due-asc",
    [priorityFilter, search, sortMode, statusFilter],
  );

  const serialize = useMemo(
    () => () => ({
      view,
      search,
      boardMode,
      calendarViewMode,
      ganttZoom,
      selectedDay,
      statusFilter,
      priorityFilter,
      sortMode,
    }),
    [boardMode, calendarViewMode, ganttZoom, priorityFilter, search, selectedDay, sortMode, statusFilter, view],
  );

  const applySerialized = useMemo(
    () => (state: Partial<SerializedWorkspaceQueryState>) => {
      if (state.view) setView(normalizeViewKey(state.view));
      if (typeof state.search === "string") setSearch(state.search);
      if (state.boardMode) setBoardMode(state.boardMode);
      if (state.calendarViewMode) setCalendarViewMode(state.calendarViewMode);
      if (state.ganttZoom) setGanttZoom(state.ganttZoom);
      if (state.selectedDay) setSelectedDay(state.selectedDay);
      if (state.statusFilter) setStatusFilter(state.statusFilter);
      if (state.priorityFilter) setPriorityFilter(state.priorityFilter);
      if (state.sortMode) setSortMode(state.sortMode);
    },
    [],
  );

  return {
    view,
    setView,
    search,
    setSearch,
    boardMode,
    setBoardMode,
    calendarViewMode,
    setCalendarViewMode,
    ganttZoom,
    setGanttZoom,
    selectedDay,
    setSelectedDay,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    sortMode,
    setSortMode,
    hasActiveFilters,
    clearTaskFilters: () => {
      setSearch("");
      setStatusFilter("all");
      setPriorityFilter("all");
      setSortMode("due-asc");
    },
    serialize,
    applySerialized,
  };
}

export type { TaskPriorityFilter, TaskSortMode, TaskStatusFilter };
