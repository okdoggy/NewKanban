import type { ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Paperclip, CheckCircle2, ShieldCheck, ArrowUpRight, LucideIcon, Trash2 } from "lucide-react";
import { formatDate, parseDate } from "@/lib/date-utils";
import type { TaskAttachment, TaskComment } from "@/lib/types";
import { cn } from "@/lib/utils";

export function getInitials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "GU"
  );
}

export function renderCommentBody(body: string) {
  const parts = body.split(/(@[a-z0-9-]+)/gi);
  return parts.map((part, index) =>
    part.startsWith("@") ? (
      <span className="font-semibold text-primary" key={`${part}-${index}`}>
        {part}
      </span>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

export function EmptyStateCard({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-dashed border-slate-300 px-4 py-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function FeatureCard({ icon: Icon, title, description }: { icon: typeof ShieldCheck; title: string; description: string }) {
  return (
    <div className="rounded-[24px] bg-white/80 p-5 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.24)]">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[16px] bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <h3 className="font-heading text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function MetricCard({ icon: Icon, label, value, tone }: { icon: typeof CheckCircle2; label: string; value: string; tone: "success" | "neutral" | "primary" | "secondary"; }) {
  const iconTone = {
    success: "bg-emerald-100 text-emerald-700",
    neutral: "bg-slate-100 text-slate-700",
    primary: "bg-blue-100 text-blue-700",
    secondary: "bg-violet-100 text-violet-700",
  }[tone];
  return (
    <Card className="glass-surface border-0 shadow-[0_16px_36px_rgba(43,75,185,0.05)]">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <span className={cn("inline-flex h-11 w-11 items-center justify-center rounded-[18px]", iconTone)}>
            <Icon className="size-5" />
          </span>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 font-heading text-4xl font-extrabold tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ActionCard({
  icon: Icon,
  title,
  description,
  count,
  tone,
  onClick,
  hideDescription = false,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  count: number;
  tone: "primary" | "amber" | "rose" | "emerald";
  onClick?: () => void;
  hideDescription?: boolean;
  compact?: boolean;
}) {
  const toneClass = {
    primary: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    emerald: "bg-emerald-50 text-emerald-700",
  }[tone];
  return (
    <button
      className={cn("group rounded-[24px] bg-white/88 text-left shadow-[0_18px_42px_rgba(43,75,185,0.06)] transition hover:-translate-y-0.5", compact ? "p-4" : "p-5")}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn("inline-flex h-11 w-11 items-center justify-center rounded-[16px]", toneClass)}>
          <Icon className="size-5" />
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          Open
          <ArrowUpRight className="size-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </div>
      <div className={cn("mt-4", hideDescription ? "space-y-1" : "space-y-2")}>
        <p className={cn("font-heading font-extrabold tracking-tight", compact ? "text-xl" : "text-2xl")}>{count}</p>
        <p className="font-medium">{title}</p>
        {!hideDescription ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </button>
  );
}

export function AttachmentRow({
  attachment,
  onDelete,
  deleting = false,
  compact = false,
}: {
  attachment: TaskAttachment;
  onDelete?: (attachmentId: string) => void;
  deleting?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-[18px] bg-white shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]", compact ? "px-3 py-2.5" : "px-4 py-3")}>
      <a className="flex min-w-0 flex-1 items-center gap-3" href={attachment.url} rel="noreferrer" target="_blank">
        <Paperclip className="size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{attachment.originalName}</p>
          <p className="truncate text-xs text-muted-foreground">Uploaded by {attachment.uploadedByName} · {Math.max(1, Math.round(attachment.size / 1024))} KB</p>
        </div>
      </a>
      {onDelete ? (
        <button
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-slate-100 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={deleting}
          onClick={() => onDelete(attachment.id)}
          type="button"
        >
          <Trash2 className="size-4" />
          <span className="sr-only">Delete attachment</span>
        </button>
      ) : null}
    </div>
  );
}

export function buildCommentTree(comments: TaskComment[]) {
  const byParent = new Map<string | null, TaskComment[]>();
  for (const comment of comments) {
    const key = comment.parentId ?? null;
    const bucket = byParent.get(key) ?? [];
    bucket.push(comment);
    byParent.set(key, bucket);
  }
  const walk = (parentId: string | null, depth: number): Array<{ comment: TaskComment; depth: number }> =>
    (byParent.get(parentId) ?? []).flatMap((comment) => [{ comment, depth }, ...walk(comment.id, depth + 1)]);
  return walk(null, 0);
}

export function CommentBubble({ comment, onDelete, onReply, depth, canDelete = false, deleting = false }: { comment: TaskComment; onReply: () => void; onDelete?: () => void; depth: number; canDelete?: boolean; deleting?: boolean; }) {
  return (
    <div className="rounded-[16px] bg-white px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]" style={{ marginLeft: depth * 16 }}>
      <div className="mb-1.5 flex items-center gap-2">
        <Avatar size="sm">
          <AvatarFallback style={{ backgroundColor: comment.authorColor, color: "white" }}>{getInitials(comment.authorName)}</AvatarFallback>
        </Avatar>
        <p className="truncate text-sm font-semibold">{comment.authorName}</p>
        <p className="text-[11px] text-muted-foreground">{formatDate(parseDate(comment.createdAt), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
        <button className="ml-auto text-[11px] font-semibold text-primary" onClick={onReply} type="button">
          Reply
        </button>
        {canDelete && onDelete ? <button className="text-[11px] font-semibold text-rose-600 disabled:opacity-50" disabled={deleting} onClick={onDelete} type="button">{deleting ? "Deleting…" : "Delete"}</button> : null}
      </div>
      <p className="pl-8 text-sm leading-5 text-muted-foreground">{renderCommentBody(comment.body)}</p>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="space-y-2 text-sm font-medium">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        {hint ? <span className="text-[11px] font-medium text-muted-foreground">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function SelectField({ label, value, onChange, children, disabled, hint }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; disabled?: boolean; hint?: string }) {
  return (
    <Field hint={hint} label={label}>
      <select className="input-shell" disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
        {children}
      </select>
    </Field>
  );
}
