export type ViewKey = "home" | "inbox" | "my-work" | "projects" | "calendar" | "collaborate";
export type LanguageCode = "en" | "ko";
export type CalendarViewMode = "month" | "week" | "day";
export type GanttZoom = "compact" | "balanced" | "focus";
export type DecisionSection = "ideas" | "questions" | "risks" | "decisions" | "actions";
export type WorkspaceJoinRequestStatus = "pending" | "approved" | "rejected";
export type NotificationType = "workspace-join-request" | "workspace-join-approved" | "direct-tech-message";

export type TaskStatus = "todo" | "progress" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type MemberRole = "owner" | "editor" | "viewer";

export interface PermissionSet {
  manageMembers: boolean;
  editWorkspace: boolean;
  editCalendar: boolean;
  editNotes: boolean;
  uploadFiles: boolean;
  comment: boolean;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  handle: string;
  name: string;
  color: string;
  locale: LanguageCode;
  role: MemberRole;
  emailVerified: boolean;
  mfaEnabled: boolean;
}

export interface WorkspaceMember extends AuthenticatedUser {
  joinedAt: string;
}

export interface UserDirectoryEntry {
  userId: string;
  email: string;
  handle: string;
  name: string;
  color: string;
}

export interface TaskAttachment {
  id: string;
  originalName: string;
  fileName: string;
  url: string;
  mimeType: string;
  size: number;
  uploadedByName: string;
  uploadedAt: string;
}

export interface TaskComment {
  id: string;
  authorUserId?: string | null;
  authorName: string;
  authorColor: string;
  body: string;
  mentions: string[];
  parentId?: string | null;
  createdAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  label: string;
  assigneeUserId?: string;
  assigneeName: string;
  assigneeColor: string;
  startDate: string;
  dueDate: string;
  progress: number;
  commentsCount: number;
  updatesCount: number;
  checklistDone: number;
  checklistTotal: number;
  comments: TaskComment[];
  attachments: TaskAttachment[];
  dependencyIds?: string[];
  linkedEventIds?: string[];
  linkedNoteId?: string | null;
  blocked?: boolean;
  atRisk?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WhiteboardNote {
  id: string;
  title: string;
  content: string;
  tag: string;
  x: number;
  y: number;
  color: string;
  section?: DecisionSection;
  votes?: number;
  linkedTaskId?: string | null;
  decisionOwnerName?: string;
  decisionDueDate?: string;
  assigneeName: string;
  assigneeColor: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhiteboardScene {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  version: number;
  updatedAt: string;
  activeTemplateId?: string;
  templates?: WhiteboardTemplateEntry[];
  updatedByName?: string;
  updatedByColor?: string;
}

export interface WhiteboardTemplateScene {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  version: number;
  updatedAt: string;
}

export interface WhiteboardTemplateEntry {
  id: string;
  label: string;
  builtIn?: boolean;
  hidden?: boolean;
  scene?: WhiteboardTemplateScene | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgendaEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: string;
  description?: string;
  relatedTaskId?: string;
  recurrence?: string | null;
  attendees: number;
  location?: string;
  link?: string;
  createdByName?: string;
  source?: "workspace" | "external" | "ics" | "automation";
  readonly?: boolean;
  externalCalendarName?: string;
  generatedByRule?: string;
}

export interface ActivityItem {
  id: string;
  actorName: string;
  actorColor: string;
  action: string;
  entityType: "task" | "note" | "event";
  entityTitle: string;
  createdAt: string;
}

export interface WorkspaceAutomation {
  progressCompletesTask: boolean;
  statusSetsProgress: boolean;
  dueDateCreatesAgendaHold: boolean;
}

export interface AutomationRule {
  id: string;
  key: string;
  label: string;
  enabled: boolean;
  lastRunAt?: string;
}

export interface AnalyticsSummary {
  overdueTasks: number;
  dueSoonTasks: number;
  blockedTasks: number;
  reviewTasks: number;
  completionRate: number;
  eventsToday: number;
  decisionNotes: number;
  convertedNotes: number;
  automationRuns: number;
}

export interface EnterpriseMeta {
  mongoLicenseAcknowledged: boolean;
  licenseWarning: string | null;
  optionalCapabilities: string[];
}

export interface Workspace {
  id: string;
  name: string;
  workspaceKey: string;
  description: string;
  ownerUserId?: string;
  createdAt?: string;
  sprintProgress: number;
  weeklyCapacity: number;
  tasks: TaskItem[];
  notes: WhiteboardNote[];
  whiteboardScene?: WhiteboardScene | null;
  agenda: AgendaEvent[];
  activity: ActivityItem[];
  automation: WorkspaceAutomation;
  savedViews?: SavedView[];
  automationRules?: AutomationRule[];
  automationRunsCount?: number;
  licenseAcknowledgedAt?: string | null;
}

export interface PresenceMember {
  id: string;
  deviceId: string;
  userId: string;
  handle: string;
  name: string;
  color: string;
  role: MemberRole;
  initials: string;
  ip: string;
  currentView: ViewKey;
  lastSeen: string;
  userAgent?: string;
  connectedAt: string;
  connectionCount?: number;
}

export interface AuditLogItem {
  id: string;
  actorName: string;
  actorEmail?: string;
  scope: "auth" | "workspace" | "security";
  action: string;
  detail: string;
  createdAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  workspaceKey: string;
  ownerUserId?: string;
  role?: MemberRole;
  joinedAt?: string;
  pendingRequest?: boolean;
  createdAt?: string;
}

export interface WorkspaceJoinRequest {
  id: string;
  workspaceId: string;
  workspaceName: string;
  requesterUserId: string;
  requesterName: string;
  requesterEmail: string;
  status: WorkspaceJoinRequestStatus;
  message?: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  workspaceId?: string;
  readAt?: string | null;
  createdAt: string;
  payload?: Record<string, string>;
}

export interface DeploymentInfo {
  enterpriseMode: boolean;
  mongoLicenseAckRequired: boolean;
  mongoLicenseAckConfigured: boolean;
  message?: string;
}

export interface SavedView {
  id: string;
  name: string;
  view: ViewKey;
  boardMode: "board" | "list";
  calendarViewMode: CalendarViewMode;
  search: string;
  statusFilter: "all" | TaskStatus;
  priorityFilter: "all" | TaskPriority;
  sortMode: "due-asc" | "due-desc" | "updated-desc" | "priority-desc";
  ganttZoom?: GanttZoom;
  createdByName?: string;
  createdAt: string;
}

export interface WorkspaceSnapshot {
  authenticated: boolean;
  workspace: Workspace;
  presence: PresenceMember[];
  members: WorkspaceMember[];
  userDirectory?: UserDirectoryEntry[];
  currentUser: AuthenticatedUser;
  permissions: PermissionSet;
  deployment?: DeploymentInfo;
  enterpriseMeta?: EnterpriseMeta;
  analytics?: AnalyticsSummary;
  externalAgenda?: AgendaEvent[];
  savedViews?: SavedView[];
  activeWorkspaceId?: string;
  serverTime: string;
}

export interface BootstrapPayload {
  authenticated: boolean;
  workspace?: Workspace;
  presence?: PresenceMember[];
  members?: WorkspaceMember[];
  userDirectory?: UserDirectoryEntry[];
  currentUser?: AuthenticatedUser;
  permissions?: PermissionSet;
  deployment?: DeploymentInfo;
  enterpriseMeta?: EnterpriseMeta;
  analytics?: AnalyticsSummary;
  externalAgenda?: AgendaEvent[];
  savedViews?: SavedView[];
  activeWorkspaceId?: string;
  serverTime: string;
}

export interface TaskDraft {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  label: string;
  startDate: string;
  dueDate: string;
}


export interface EventDraft {
  title: string;
  start: string;
  end: string;
  type: string;
  description: string;
  location: string;
  link: string;
  relatedTaskId: string;
  recurrence: "none" | "daily" | "weekly" | "monthly";
}
