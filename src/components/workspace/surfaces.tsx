"use client";

import {
  MessageSquare,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  DECISION_SECTIONS,
  EVENT_TYPE_OPTIONS,
  NOTE_COLOR_OPTIONS,
  PALETTE,
  RECURRENCE_OPTIONS,
  roleMeta,
  statusMeta,
  STATUS_ORDER,
} from "@/components/workspace/config";
import {
  AttachmentRow,
  buildCommentTree,
  CommentBubble,
  Field,
  getInitials,
  SelectField,
} from "@/components/workspace/shared";
import { relativeTime } from "@/lib/date-utils";
import type {
  AnalyticsSummary,
  AuditLogItem,
  AuthenticatedUser,
  AutomationRule,
  EventDraft,
  MemberRole,
  NoteDraft,
  PermissionSet,
  SavedView,
  TaskDraft,
  TaskItem,
  TaskPriority,
  TaskStatus,
  UserDirectoryEntry,
  WorkspaceMember,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export interface AuthFormState {
  name: string;
  handle: string;
  email: string;
  password: string;
}

export interface TaskDetailDraft {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string;
  dueDate: string;
  progress: number;
  assigneeUserId: string;
}

const TASK_PRIORITY_ORDER: TaskPriority[] = ["low", "medium", "high"];

function cycleTaskStatus(status: TaskStatus): TaskStatus {
  const currentIndex = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length] ?? "todo";
}

function cycleTaskPriority(priority: TaskPriority): TaskPriority {
  const currentIndex = TASK_PRIORITY_ORDER.indexOf(priority);
  return TASK_PRIORITY_ORDER[(currentIndex + 1) % TASK_PRIORITY_ORDER.length] ?? "low";
}

export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(72,101,211,0.12),_transparent_30%),_#f7f9fb]">
      <Card className="w-full max-w-md border-white/50 bg-white/80 shadow-[0_24px_60px_rgba(43,75,185,0.08)] backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="font-heading text-3xl tracking-tight">Loading workspace…</CardTitle>
          <CardDescription>Bootstrapping authenticated realtime collaboration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="h-3 rounded-full bg-slate-200" />
            <div className="h-3 w-4/5 rounded-full bg-slate-200" />
            <div className="h-3 w-3/5 rounded-full bg-slate-200" />
          </div>
          <Progress value={72} />
        </CardContent>
      </Card>
    </div>
  );
}

export function AuthScreen({ authForm, authError, authInfo, authBusy, mfaChallengeToken, mfaCode, onChange, onMfaCodeChange, onSubmit, onRequestPasswordReset }: { authForm: AuthFormState; authError: string | null; authInfo: string | null; authBusy: boolean; mfaChallengeToken: string | null; mfaCode: string; onChange: (value: AuthFormState) => void; onMfaCodeChange: (value: string) => void; onSubmit: () => void; onRequestPasswordReset: () => void; }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app-gradient px-4 py-10 text-foreground">
      <Card className="w-full max-w-md border-0 bg-white/92 shadow-[0_24px_60px_rgba(43,75,185,0.08)]">
        <CardHeader className="pb-4">
          <CardTitle className="font-heading text-3xl tracking-tight">Login</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Knox ID">
            <Input autoFocus onChange={(event) => onChange({ ...authForm, email: event.target.value })} placeholder="admin.kim" value={authForm.email} />
          </Field>
          {!mfaChallengeToken ? (
            <Field label="Password">
              <Input onChange={(event) => onChange({ ...authForm, password: event.target.value })} type="password" value={authForm.password} />
            </Field>
          ) : (
            <Field label="MFA code">
              <Input onChange={(event) => onMfaCodeChange(event.target.value)} value={mfaCode} />
            </Field>
          )}
          {authInfo ? <div className="rounded-[16px] bg-blue-50 px-4 py-3 text-sm text-blue-700">{authInfo}</div> : null}
          {authError ? <div className="rounded-[16px] bg-rose-50 px-4 py-3 text-sm text-rose-700">{authError}</div> : null}
          <Button className="w-full" disabled={authBusy} onClick={onSubmit}>
            {authBusy ? "Working…" : mfaChallengeToken ? "Verify" : "Login"}
          </Button>
          <Button className="w-full" disabled={authBusy || !authForm.email.trim()} onClick={onRequestPasswordReset} variant="outline">
            Reset password to 0000
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function TaskCreateDialog({ open, onOpenChange, taskDraft, onChange, onSubmit }: { open: boolean; onOpenChange: (value: boolean) => void; taskDraft: TaskDraft; onChange: (value: TaskDraft) => void; onSubmit: () => void; }) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6"><DialogTitle>Create a shared task</DialogTitle><DialogDescription>This task will be persisted to MongoDB and synced to every authenticated teammate.</DialogDescription></DialogHeader>
        <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2"><label className="text-sm font-medium">Title</label><Input onChange={(event) => onChange({ ...taskDraft, title: event.target.value })} value={taskDraft.title} /></div>
          <div className="space-y-2 md:col-span-2"><label className="text-sm font-medium">Description</label><Textarea onChange={(event) => onChange({ ...taskDraft, description: event.target.value })} rows={4} value={taskDraft.description} /></div>
          <SelectField label="Status" value={taskDraft.status} onChange={(value) => onChange({ ...taskDraft, status: value as TaskStatus })}>{STATUS_ORDER.map((status) => <option key={status} value={status}>{statusMeta[status].label}</option>)}</SelectField>
          <SelectField label="Priority" value={taskDraft.priority} onChange={(value) => onChange({ ...taskDraft, priority: value as TaskPriority })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></SelectField>
          <Field label="Label"><Input onChange={(event) => onChange({ ...taskDraft, label: event.target.value })} value={taskDraft.label} /></Field>
          <Field label="Start date"><Input onChange={(event) => onChange({ ...taskDraft, startDate: event.target.value })} type="date" value={taskDraft.startDate} /></Field>
          <Field label="Due date"><Input onChange={(event) => onChange({ ...taskDraft, dueDate: event.target.value })} type="date" value={taskDraft.dueDate} /></Field>
        </div>
        <DialogFooter className="mt-0" showCloseButton><Button onClick={onSubmit}>Save task</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TaskDetailDialog({
  open,
  onOpenChange,
  selectedTask,
  taskDetailDraft,
  setTaskDetailDraft,
  onSave,
  onDeleteTask,
  taskCommentDraft,
  onCommentChange,
  onCommentSubmit,
  onCommentDelete,
  permissions,
  onFileUpload,
  onFileDelete,
  uploadBusy,
  deletingAttachmentId,
  deletingCommentId,
  deletingTask,
  replyTargetId,
  onReplyTargetChange,
  members,
  userDirectory,
  currentUser,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  selectedTask: TaskItem | null;
  taskDetailDraft: TaskDetailDraft | null;
  setTaskDetailDraft: (value: TaskDetailDraft | null | ((current: TaskDetailDraft | null) => TaskDetailDraft | null)) => void;
  onSave: () => void;
  onDeleteTask: () => void;
  taskCommentDraft: string;
  onCommentChange: (value: string) => void;
  onCommentSubmit: () => void;
  onCommentDelete: (commentId: string) => void;
  permissions: PermissionSet;
  onFileUpload: (file: File) => Promise<void> | void;
  onFileDelete: (attachmentId: string) => Promise<void> | void;
  uploadBusy: boolean;
  deletingAttachmentId: string | null;
  deletingCommentId: string | null;
  deletingTask: boolean;
  replyTargetId: string | null;
  onReplyTargetChange: (value: string | null) => void;
  members: WorkspaceMember[];
  userDirectory: UserDirectoryEntry[];
  currentUser: AuthenticatedUser;
}) {
  const assignableMembers = useMemo(() => {
    const merged = new Map<string, UserDirectoryEntry & { isCurrentUser: boolean }>();

    const register = (member: Pick<UserDirectoryEntry, "userId" | "email" | "handle" | "name" | "color"> | null | undefined) => {
      if (!member?.userId) return;
      if (merged.has(member.userId)) return;
      merged.set(member.userId, {
        ...member,
        isCurrentUser: member.userId === currentUser.userId,
      });
    };

    userDirectory.forEach((member) => register(member));
    members.forEach((member) => register(member));
    register(currentUser);

    return [...merged.values()].sort((left, right) => {
      if (left.isCurrentUser !== right.isCurrentUser) return left.isCurrentUser ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
  }, [currentUser, members, userDirectory]);

  const fallbackAssignee = assignableMembers.find((member) => member.userId === currentUser.userId) ?? assignableMembers[0] ?? null;
  const currentAssignee = taskDetailDraft ? assignableMembers.find((member) => member.userId === taskDetailDraft.assigneeUserId) ?? fallbackAssignee : fallbackAssignee;

  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeIndex, setAssigneeIndex] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const rawAssigneeQuery = assigneeQuery.trim().toLowerCase();
  const normalizedCurrentAssignee = currentAssignee?.name.trim().toLowerCase() ?? "";
  const normalizedQuery = assigneeOpen && rawAssigneeQuery === normalizedCurrentAssignee ? "" : rawAssigneeQuery;
  const assigneeSuggestions = useMemo(() => {
    if (!taskDetailDraft) return assignableMembers.slice(0, 6);
    const scoreMember = (member: UserDirectoryEntry & { isCurrentUser: boolean }) => {
      const candidates = [member.name, member.handle, member.email].map((value) => value.toLowerCase());
      if (!normalizedQuery) return member.userId === currentUser.userId ? 0 : 1;
      if (candidates.some((value) => value === normalizedQuery)) return 0;
      if (candidates.some((value) => value.startsWith(normalizedQuery))) return 1;
      if (candidates.some((value) => value.includes(normalizedQuery))) return 2;
      return 9;
    };

    return [...assignableMembers]
      .map((member) => ({ member, score: scoreMember(member) }))
      .filter((entry) => entry.score < 9)
      .sort((left, right) => left.score - right.score || left.member.name.localeCompare(right.member.name))
      .map((entry) => entry.member)
      .slice(0, 6);
  }, [assignableMembers, currentUser.userId, normalizedQuery, taskDetailDraft]);

  const applyAssignee = (member: (UserDirectoryEntry & { isCurrentUser: boolean }) | null) => {
    const nextAssignee = member ?? fallbackAssignee;
    if (!nextAssignee) return;
    setTaskDetailDraft((current) => current ? { ...current, assigneeUserId: nextAssignee.userId } : current);
    setAssigneeQuery(nextAssignee.name);
    setAssigneeOpen(false);
    setAssigneeIndex(0);
  };

  if (!selectedTask || !taskDetailDraft) return null;

  const statusButtonLabel = statusMeta[taskDetailDraft.status].label;
  const nextStatusLabel = statusMeta[cycleTaskStatus(taskDetailDraft.status)].label;
  const nextPriorityLabel = cycleTaskPriority(taskDetailDraft.priority);
  const canDeleteComment = (authorUserId?: string | null) => currentUser.role === "owner" || (Boolean(authorUserId) && authorUserId === currentUser.userId);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[94vh] w-[min(92vw,1240px)] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0 sm:max-w-[min(92vw,1240px)]">
        <DialogHeader className="border-b px-4 py-4 sm:px-5">
          <DialogTitle className="sr-only">Task details</DialogTitle>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <Input
                className="h-11 rounded-xl border-slate-200 bg-slate-50 text-xl font-semibold"
                disabled={!permissions.editWorkspace}
                onChange={(event) => setTaskDetailDraft((current) => current ? { ...current, title: event.target.value } : current)}
                placeholder="Untitled task"
                value={taskDetailDraft.title}
              />
              <div className="flex flex-wrap gap-2">
                <Badge className={cn("rounded-full border-0", statusMeta[taskDetailDraft.status].badgeClassName)}>{statusMeta[taskDetailDraft.status].label}</Badge>
                <Badge className={cn("rounded-full border-0", taskDetailDraft.priority === "high" ? "bg-rose-100 text-rose-700" : taskDetailDraft.priority === "medium" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600")}>{taskDetailDraft.priority}</Badge>
                <Badge className="rounded-full bg-white text-muted-foreground">{taskDetailDraft.progress}% complete</Badge>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {permissions.editWorkspace ? <Button className="shrink-0" disabled={deletingTask} onClick={onDeleteTask} size="sm" variant="destructive">{deletingTask ? "Deleting…" : "Delete task"}</Button> : null}
              {permissions.editWorkspace ? <Button className="shrink-0" onClick={onSave} size="sm">Save changes</Button> : null}
            </div>
          </div>
        </DialogHeader>
        <div className="max-h-[calc(94vh-108px)] overflow-y-auto px-3 py-3 sm:px-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-3">
              <Card className="border-0 bg-white/90 shadow-[0_18px_44px_rgba(43,75,185,0.08)]">
                <CardContent className="p-4">
                  <Field label="Description">
                    <Textarea disabled={!permissions.editWorkspace} onChange={(event) => setTaskDetailDraft((current) => current ? { ...current, description: event.target.value } : current)} rows={6} value={taskDetailDraft.description} />
                  </Field>
                </CardContent>
              </Card>

              <Card className="border-0 bg-slate-50/85 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Updates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 p-3 sm:p-4">
                  <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                    {selectedTask.comments.length > 0 ? buildCommentTree(selectedTask.comments).map((comment) => <CommentBubble canDelete={canDeleteComment(comment.comment.authorUserId)} comment={comment.comment} deleting={deletingCommentId === comment.comment.id} depth={comment.depth} key={comment.comment.id} onDelete={() => onCommentDelete(comment.comment.id)} onReply={() => onReplyTargetChange(comment.comment.id)} />) : <div className="rounded-[18px] border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-muted-foreground">No updates yet. Start the thread for this task.</div>}
                  </div>
                  {replyTargetId ? <div className="flex items-center justify-between text-[11px] font-medium text-primary"><span>Replying in thread…</span><button onClick={() => onReplyTargetChange(null)} type="button">Clear</button></div> : null}
                  {permissions.comment ? <><Textarea onChange={(event) => onCommentChange(event.target.value)} placeholder="Write an update and mention teammates like @workspace-owner" rows={2} value={taskCommentDraft} /><Button className="w-full" onClick={onCommentSubmit} size="sm"><MessageSquare className="size-4" />Post update</Button></> : null}
                </CardContent>
              </Card>
            </div>

            <aside className="space-y-3">
              <Card className="border-0 bg-slate-50/85 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]">
                <CardHeader className="pb-2"><CardTitle className="text-base">Properties</CardTitle></CardHeader>
                <CardContent className="grid gap-3 p-3 sm:grid-cols-2">
                  <Field label="Status">
                    <button
                      className={cn("flex min-h-10 w-full items-center justify-between rounded-xl border bg-white px-3 py-2 text-sm shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)]", statusMeta[taskDetailDraft.status].badgeClassName)}
                      disabled={!permissions.editWorkspace}
                      onClick={() => setTaskDetailDraft((current) => current ? { ...current, status: cycleTaskStatus(current.status) } : current)}
                      type="button"
                    >
                      <span className="text-left">
                        <span className="block font-medium">{statusButtonLabel}</span>
                        <span className="block text-[11px] opacity-75">Next · {nextStatusLabel}</span>
                      </span>
                    </button>
                  </Field>
                  <Field label="Priority">
                    <button
                      className={cn("flex min-h-10 w-full items-center justify-between rounded-xl border bg-white px-3 py-2 text-sm shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)]", taskDetailDraft.priority === "high" ? "border-rose-200 text-rose-700" : taskDetailDraft.priority === "medium" ? "border-indigo-200 text-indigo-700" : "border-slate-200 text-slate-600")}
                      disabled={!permissions.editWorkspace}
                      onClick={() => setTaskDetailDraft((current) => current ? { ...current, priority: cycleTaskPriority(current.priority) } : current)}
                      type="button"
                    >
                      <span className="text-left">
                        <span className="block font-medium capitalize">{taskDetailDraft.priority}</span>
                        <span className="block text-[11px] opacity-75">Next · {nextPriorityLabel}</span>
                      </span>
                    </button>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Assignee">
                    <div className="relative">
                      <Input
                        disabled={!permissions.editWorkspace}
                        onBlur={() => {
                          window.setTimeout(() => {
                            setAssigneeOpen(false);
                            const exactMember = assignableMembers.find((member) => [member.name, member.handle, member.email].some((candidate) => candidate.toLowerCase() === assigneeQuery.trim().toLowerCase()));
                            applyAssignee(exactMember ?? fallbackAssignee);
                          }, 120);
                        }}
                        onChange={(event) => {
                          const value = event.target.value;
                          setAssigneeQuery(value);
                          setAssigneeOpen(true);
                          setAssigneeIndex(0);
                        }}
                        onFocus={() => {
                          setAssigneeQuery(currentAssignee?.name ?? currentUser.name);
                          setAssigneeOpen(true);
                          setAssigneeIndex(0);
                        }}
                        onKeyDown={(event) => {
                          if (!assigneeOpen && event.key === "ArrowDown") {
                            event.preventDefault();
                            setAssigneeOpen(true);
                            return;
                          }
                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setAssigneeIndex((current) => assigneeSuggestions.length === 0 ? 0 : (current + 1) % assigneeSuggestions.length);
                          } else if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setAssigneeIndex((current) => assigneeSuggestions.length === 0 ? 0 : (current - 1 + assigneeSuggestions.length) % assigneeSuggestions.length);
                          } else if (event.key === "Enter") {
                            event.preventDefault();
                            const exactMember = assignableMembers.find((member) => [member.name, member.handle, member.email].some((candidate) => candidate.toLowerCase() === assigneeQuery.trim().toLowerCase()));
                            applyAssignee(assigneeSuggestions[assigneeIndex] ?? exactMember ?? fallbackAssignee);
                          } else if (event.key === "Escape") {
                            setAssigneeOpen(false);
                            setAssigneeQuery(currentAssignee?.name ?? fallbackAssignee?.name ?? currentUser.name);
                          }
                        }}
                        placeholder="Type a name, handle, or email"
                        value={assigneeOpen ? assigneeQuery : currentAssignee?.name ?? ""}
                      />
                      {assigneeOpen && assigneeSuggestions.length > 0 ? (
                        <div className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-10 rounded-[18px] border bg-white p-1.5 shadow-[0_18px_40px_rgba(43,75,185,0.12)]">
                          {assigneeSuggestions.map((member, index) => (
                            <button
                              className={cn("flex w-full items-center justify-between rounded-[14px] px-3 py-2 text-left text-sm transition", index === assigneeIndex ? "bg-slate-100" : "hover:bg-slate-50")}
                              key={member.userId}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                applyAssignee(member);
                              }}
                              type="button"
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{member.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">@{member.handle} · {member.email}</span>
                              </span>
                              {member.userId === currentUser.userId ? <Badge className="rounded-full bg-slate-100 text-slate-600">You</Badge> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {normalizedQuery && assigneeSuggestions.length === 0 ? <p className="text-xs text-muted-foreground">No matching user found. This task will default to {fallbackAssignee?.name ?? currentUser.name}.</p> : null}
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Progress"><div className="space-y-1.5"><input className="w-full accent-[#2b4bb9]" disabled={!permissions.editWorkspace} max={100} min={0} onChange={(event) => setTaskDetailDraft((current) => current ? { ...current, progress: Number(event.target.value) } : current)} type="range" value={taskDetailDraft.progress} /><div className="text-xs text-muted-foreground">{taskDetailDraft.progress}%</div></div></Field>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 bg-slate-50/85 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Files</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 p-3">
                  {permissions.uploadFiles ? (
                    <label
                      className={cn(
                        "flex cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-dashed px-3 py-2.5 text-center text-xs font-medium transition",
                        dragActive ? "border-primary bg-primary/5 text-foreground" : "border-slate-300 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                      onDragEnter={() => setDragActive(true)}
                      onDragLeave={() => setDragActive(false)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragActive(true);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragActive(false);
                        const files = Array.from(event.dataTransfer.files ?? []);
                        for (const file of files) void onFileUpload(file);
                      }}
                    >
                      <Upload className="size-4" />
                      {uploadBusy ? "Uploading…" : "Drop files or click to upload"}
                      <input
                        className="hidden"
                        disabled={uploadBusy}
                        multiple
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          for (const file of files) void onFileUpload(file);
                          event.currentTarget.value = "";
                        }}
                        type="file"
                      />
                    </label>
                  ) : null}
                  <div className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
                    {selectedTask.attachments.length > 0 ? selectedTask.attachments.map((attachment) => <AttachmentRow attachment={attachment} compact deleting={deletingAttachmentId === attachment.id} key={attachment.id} onDelete={(attachmentId) => void onFileDelete(attachmentId)} />) : <div className="rounded-[16px] border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-muted-foreground">No files uploaded yet.</div>}
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
        <DialogFooter className="mt-0" showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

export function NoteDialog({ open, onOpenChange, noteDraft, onChange, onSubmit, editing }: { open: boolean; onOpenChange: (value: boolean) => void; noteDraft: NoteDraft; onChange: (value: NoteDraft) => void; onSubmit: () => void; editing: boolean; }) {
  const needsDecisionFields = noteDraft.section === "decisions" || noteDraft.section === "actions";
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6"><DialogTitle>{editing ? "Edit decision canvas note" : "Create a decision canvas note"}</DialogTitle><DialogDescription>Keep notes short, structured, and easy to convert into action.</DialogDescription></DialogHeader>
        <div className="space-y-4 px-6 py-6">
          <Field label="Title"><Input onChange={(event) => onChange({ ...noteDraft, title: event.target.value })} value={noteDraft.title} /></Field>
          <Field label="Context"><Textarea onChange={(event) => onChange({ ...noteDraft, content: event.target.value })} rows={4} value={noteDraft.content} /></Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tag"><Input onChange={(event) => onChange({ ...noteDraft, tag: event.target.value })} value={noteDraft.tag} /></Field>
            <Field label="Section"><select className="input-shell" onChange={(event) => onChange({ ...noteDraft, section: event.target.value as NoteDraft["section"] })} value={noteDraft.section}>{DECISION_SECTIONS.map((section) => <option key={section.key} value={section.key}>{section.label}</option>)}</select></Field>
          </div>
          {needsDecisionFields ? <div className="grid gap-4 md:grid-cols-2"><Field label="Owner"><Input onChange={(event) => onChange({ ...noteDraft, decisionOwnerName: event.target.value })} value={noteDraft.decisionOwnerName ?? ""} /></Field><Field label="Due date"><Input onChange={(event) => onChange({ ...noteDraft, decisionDueDate: event.target.value })} type="date" value={noteDraft.decisionDueDate ?? ""} /></Field></div> : null}
          <Field label="Card color"><div className="flex flex-wrap gap-2">{NOTE_COLOR_OPTIONS.map((color) => <button className={cn("h-10 w-10 rounded-full border-2 transition-transform hover:scale-105", noteDraft.color === color ? "border-primary" : "border-white/60")} key={color} onClick={() => onChange({ ...noteDraft, color })} style={{ backgroundColor: color }} type="button" />)}</div></Field>
        </div>
        <DialogFooter className="mt-0" showCloseButton><Button onClick={onSubmit}>{editing ? "Update note" : "Save note"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EventDialog({ open, onOpenChange, eventDraft, onChange, onSubmit, onDelete, deleting = false, editing }: { open: boolean; onOpenChange: (value: boolean) => void; eventDraft: EventDraft; onChange: (value: EventDraft) => void; onSubmit: () => void; onDelete?: () => void; deleting?: boolean; editing: boolean; }) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6"><DialogTitle>{editing ? "Edit event" : "Add event"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2"><label className="text-sm font-medium">Title</label><Input onChange={(event) => onChange({ ...eventDraft, title: event.target.value })} value={eventDraft.title} /></div>
          <Field label="Start"><Input onChange={(event) => onChange({ ...eventDraft, start: event.target.value })} type="datetime-local" value={eventDraft.start} /></Field>
          <Field label="End"><Input onChange={(event) => onChange({ ...eventDraft, end: event.target.value })} type="datetime-local" value={eventDraft.end} /></Field>
          <SelectField label="Type" onChange={(value) => onChange({ ...eventDraft, type: value })} value={eventDraft.type}>{EVENT_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}</SelectField>
          <SelectField label="Repeat" onChange={(value) => onChange({ ...eventDraft, recurrence: value as EventDraft["recurrence"] })} value={eventDraft.recurrence}>{RECURRENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectField>
          <div className="space-y-2 md:col-span-2"><label className="text-sm font-medium">Note</label><Textarea onChange={(event) => onChange({ ...eventDraft, description: event.target.value })} rows={3} value={eventDraft.description} /></div>
        </div>
        <DialogFooter className="mt-0" showCloseButton>
          {editing && onDelete ? <Button onClick={onDelete} variant="destructive">{deleting ? "Deleting…" : "Delete event"}</Button> : null}
          <Button onClick={onSubmit}>{editing ? "Update event" : "Save event"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProfileDialog({ open, onOpenChange, profileDraft, onChange, onSubmit, currentUser, onLogout }: { open: boolean; onOpenChange: (value: boolean) => void; profileDraft: { name: string; color: string }; onChange: (value: { name: string; color: string }) => void; onSubmit: () => void; currentUser: AuthenticatedUser; onLogout?: () => void; }) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="w-[920px] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0 sm:max-w-[920px]">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="font-heading text-3xl tracking-tight">Account</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 px-6 py-6 md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6">
            <Card className="border-0 bg-slate-50/80 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold text-white" style={{ backgroundColor: profileDraft.color }}>
                  {getInitials(profileDraft.name || currentUser.name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{profileDraft.name || currentUser.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{currentUser.email}</p>
                </div>
              </CardContent>
            </Card>

            <Field label="Display name">
              <Input className="h-11" onChange={(event) => onChange({ ...profileDraft, name: event.target.value })} value={profileDraft.name} />
            </Field>
          </div>

          <Card className="border-0 bg-slate-50/80 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Color</CardTitle>
              <CardDescription>Choose the color used for your avatar and presence.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                {PALETTE.map((color) => (
                  <button
                    aria-label={`Select color ${color}`}
                    className={cn("h-9 w-9 rounded-full border-2 transition hover:scale-105", profileDraft.color === color ? "border-primary ring-2 ring-primary/20" : "border-white/60")}
                    key={color}
                    onClick={() => onChange({ ...profileDraft, color })}
                    style={{ backgroundColor: color }}
                    type="button"
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="flex items-center justify-between gap-3 border-t bg-muted/50 px-6 py-4">
          {onLogout ? <Button onClick={onLogout} variant="ghost">Logout</Button> : <span />}
          <Button onClick={onSubmit}>Save profile</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MembersDialog({ open, onOpenChange, workspaceName, members, onRoleChange, currentUser, updatingUserId, readOnly = false }: { open: boolean; onOpenChange: (value: boolean) => void; workspaceName: string; members: WorkspaceMember[]; onRoleChange: (userId: string, role: MemberRole) => void; currentUser: AuthenticatedUser; updatingUserId?: string | null; readOnly?: boolean; }) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="w-[1080px] max-h-[84vh] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0 sm:max-w-[1080px]">
        <DialogHeader className="border-b px-4 py-3"><DialogTitle className="font-heading text-xl tracking-tight">{workspaceName}</DialogTitle></DialogHeader>
        <div className="max-h-[calc(84vh-60px)] overflow-auto px-4 py-3">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="border-b bg-background/95">
                <TableHead className="sticky top-0 z-10 w-[32%] bg-background/95 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Member</TableHead>
                <TableHead className="sticky top-0 z-10 w-[20%] bg-background/95 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">ID</TableHead>
                <TableHead className="sticky top-0 z-10 w-[34%] bg-background/95 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Email</TableHead>
                <TableHead className="sticky top-0 z-10 w-[14%] bg-background/95 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow className="bg-slate-50/75" key={member.userId}>
                  <TableCell className="py-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none text-white" style={{ backgroundColor: member.color }}>
                        {getInitials(member.name)}
                      </div>
                      <span className="truncate text-[13px] font-medium">{member.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="truncate py-2 text-[12px] text-muted-foreground">@{member.handle}</TableCell>
                  <TableCell className="truncate py-2 text-[12px] text-muted-foreground">{member.email}</TableCell>
                    <TableCell className="py-2">
                    {member.userId === currentUser.userId || readOnly ? (
                      <Badge className={cn("rounded-full border-0 px-2 py-0.5 text-[10px]", roleMeta[member.role])}>{member.role}</Badge>
                    ) : (
                      <select className="input-shell h-7 w-[88px] min-w-[88px] rounded-full px-2 text-[11px]" disabled={updatingUserId === member.userId} onChange={(event) => onRoleChange(member.userId, event.target.value as MemberRole)} value={member.role}>
                        <option value="owner">Owner</option>
                        <option value="editor">Edit</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AuditDialog({ open, onOpenChange, auditLogs }: { open: boolean; onOpenChange: (value: boolean) => void; auditLogs: AuditLogItem[] }) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6"><DialogTitle>Audit log</DialogTitle><DialogDescription>Security and collaboration actions recorded by the system.</DialogDescription></DialogHeader>
        <div className="space-y-3 px-6 py-6">
          {auditLogs.map((log) => (
            <div className="rounded-[18px] bg-slate-50 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]" key={log.id}>
              <div className="mb-1 flex items-center justify-between gap-3"><p className="text-sm font-semibold">{log.action}</p><Badge className="rounded-full bg-slate-100 text-slate-600">{log.scope}</Badge></div>
              <p className="text-sm text-muted-foreground">{log.detail}</p>
              <p className="mt-2 text-xs text-muted-foreground">{log.actorName} · {relativeTime(log.createdAt)}</p>
            </div>
          ))}
        </div>
        <DialogFooter className="mt-0" showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

export function AutomationDialog({ open, onOpenChange, rules, onToggle }: { open: boolean; onOpenChange: (value: boolean) => void; rules: AutomationRule[]; onToggle: (ruleId: string, enabled: boolean) => void; }) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6"><DialogTitle>Automation</DialogTitle><DialogDescription>Keep automation lightweight, predictable, and enterprise-safe.</DialogDescription></DialogHeader>
        <div className="space-y-3 px-6 py-6">
          {rules.map((rule) => (
            <label className="flex items-start justify-between gap-4 rounded-[20px] bg-slate-50 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]" key={rule.id}>
              <div>
                <p className="font-medium">{rule.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{rule.lastRunAt ? `Last changed ${relativeTime(rule.lastRunAt)}` : "Not triggered yet."}</p>
              </div>
              <input checked={rule.enabled} onChange={(event) => onToggle(rule.id, event.target.checked)} type="checkbox" />
            </label>
          ))}
        </div>
        <DialogFooter className="mt-0" showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

export function SavedViewsDialog({ open, onOpenChange, savedViews, onApply, onCreate, onDelete }: { open: boolean; onOpenChange: (value: boolean) => void; savedViews: SavedView[]; onApply: (savedView: SavedView) => void; onCreate: (name: string) => void; onDelete: (savedViewId: string) => void; }) {
  const [draftName, setDraftName] = useState("");
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6"><DialogTitle>Saved views</DialogTitle><DialogDescription>Store lightweight workspace contexts without adding heavy reporting overhead.</DialogDescription></DialogHeader>
        <div className="space-y-4 px-6 py-6">
          <div className="flex gap-2">
            <Input onChange={(event) => setDraftName(event.target.value)} placeholder="Name this current view" value={draftName} />
            <Button onClick={() => { if (!draftName.trim()) return; onCreate(draftName.trim()); setDraftName(""); }}>Save</Button>
          </div>
          <div className="space-y-3">
            {savedViews.length > 0 ? savedViews.map((savedView) => (
              <div className="flex items-center gap-3 rounded-[18px] bg-slate-50 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]" key={savedView.id}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{savedView.name}</p>
                  <p className="text-xs text-muted-foreground">{savedView.view} · {savedView.createdByName ?? "workspace"} · {savedView.boardMode}</p>
                </div>
                <Button onClick={() => onApply(savedView)} size="sm" variant="outline">Apply</Button>
                <Button onClick={() => onDelete(savedView.id)} size="sm" variant="ghost">Delete</Button>
              </div>
            )) : <div className="rounded-[18px] border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-muted-foreground">No saved views yet.</div>}
          </div>
        </div>
        <DialogFooter className="mt-0" showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

export function InsightsDialog({ open, onOpenChange, analytics }: { open: boolean; onOpenChange: (value: boolean) => void; analytics: AnalyticsSummary | null }) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6"><DialogTitle>Workspace insights</DialogTitle><DialogDescription>Lightweight analytics for throughput, risk, and execution health.</DialogDescription></DialogHeader>
        <div className="grid gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
          {analytics ? [
            ["Completion rate", `${analytics.completionRate}%`],
            ["Overdue", String(analytics.overdueTasks)],
            ["Due soon", String(analytics.dueSoonTasks)],
            ["Blocked", String(analytics.blockedTasks)],
            ["Review queue", String(analytics.reviewTasks)],
            ["Decision notes", String(analytics.decisionNotes)],
            ["Converted notes", String(analytics.convertedNotes)],
            ["Events today", String(analytics.eventsToday)],
            ["Automation runs", String(analytics.automationRuns)],
          ].map(([label, value]) => (
            <Card className="border-0 bg-slate-50/80 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]" key={label}>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 font-heading text-3xl font-extrabold tracking-tight">{value}</p>
              </CardContent>
            </Card>
          )) : <Card className="md:col-span-2 xl:col-span-3"><CardContent className="p-8 text-center text-sm text-muted-foreground">Insights are unavailable until bootstrap finishes.</CardContent></Card>}
        </div>
        <DialogFooter className="mt-0" showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
