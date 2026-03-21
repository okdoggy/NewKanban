import type { TaskItem, TaskPriority, TaskStatus } from "@/lib/types";

export type TaskStatusFilter = "all" | TaskStatus;
export type TaskPriorityFilter = "all" | TaskPriority;
export type TaskSortMode = "due-asc" | "due-desc" | "updated-desc" | "priority-desc";

export interface TaskQueryState {
  search: string;
  statusFilter: TaskStatusFilter;
  priorityFilter: TaskPriorityFilter;
  sortMode: TaskSortMode;
}

const priorityRank: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function filterTasks(tasks: TaskItem[], query: Pick<TaskQueryState, "search" | "statusFilter" | "priorityFilter">) {
  const normalizedSearch = query.search.trim().toLowerCase();

  return tasks.filter((task) => {
    const matchesSearch =
      !normalizedSearch ||
      [task.title, task.description, task.assigneeName, task.label].some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      );
    const matchesStatus = query.statusFilter === "all" || task.status === query.statusFilter;
    const matchesPriority = query.priorityFilter === "all" || task.priority === query.priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });
}

export function filterAndSortTasks(tasks: TaskItem[], query: TaskQueryState) {
  const filtered = filterTasks(tasks, query);

  return filtered.toSorted((left, right) => {
    switch (query.sortMode) {
      case "due-asc":
        return left.dueDate.localeCompare(right.dueDate);
      case "due-desc":
        return right.dueDate.localeCompare(left.dueDate);
      case "updated-desc":
        return right.updatedAt.localeCompare(left.updatedAt);
      case "priority-desc":
        return priorityRank[left.priority] - priorityRank[right.priority] || left.dueDate.localeCompare(right.dueDate);
      default:
        return 0;
    }
  });
}
