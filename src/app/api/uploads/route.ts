import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { cookies } from "next/headers";

import { ACTIVE_WORKSPACE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getAuthContextFromToken } from "@/lib/auth-server";
import { getMongoDb } from "@/lib/mongo";
import { mutateWorkspace } from "@/lib/workspace-server";
import { emitWorkspaceRefresh } from "@/lib/realtime-bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const db = await getMongoDb();
  const auth = await getAuthContextFromToken(db, sessionToken, cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value);

  if (!auth || !auth.permissions.uploadFiles) {
    return Response.json({ message: "Not authorized to upload files." }, { status: 403 });
  }

  const formData = await request.formData();
  const taskId = String(formData.get("taskId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || !taskId) {
    return Response.json({ message: "Task and file are required." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const safeBaseName = file.name.replace(/[^a-zA-Z0-9.-]+/g, "-");
  const fileName = `${crypto.randomUUID()}-${safeBaseName}`;
  const fileUrl = `/uploads/${fileName}`;
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, fileName), bytes);

  const attachment = {
    id: crypto.randomUUID(),
    originalName: file.name,
    fileName,
    url: fileUrl,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    uploadedByName: auth.currentUser.name,
    uploadedAt: new Date().toISOString(),
  };

  await mutateWorkspace((workspace) => {
    const task = workspace.tasks.find((item) => item.id === taskId);
    if (!task) {
      throw new Error("Task not found.");
    }

    task.attachments = [attachment, ...(task.attachments ?? [])];
    task.updatedAt = new Date().toISOString();
    task.updatesCount += 1;
    workspace.activity.unshift({
      id: crypto.randomUUID(),
      actorName: auth.currentUser.name,
      actorColor: auth.currentUser.color,
      action: "uploaded file to",
      entityType: "task",
      entityTitle: task.title,
      createdAt: new Date().toISOString(),
    });
    workspace.activity = workspace.activity.slice(0, 20);
  }, auth.workspaceId);

  await emitWorkspaceRefresh(auth.workspaceId);

  return Response.json({ ok: true, attachment });
}

export async function DELETE(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const db = await getMongoDb();
  const auth = await getAuthContextFromToken(db, sessionToken, cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value);

  if (!auth || !auth.permissions.uploadFiles) {
    return Response.json({ message: "Not authorized to remove files." }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const taskId = String(payload?.taskId ?? "");
  const attachmentId = String(payload?.attachmentId ?? "");
  if (!taskId || !attachmentId) {
    return Response.json({ message: "Task and attachment are required." }, { status: 400 });
  }

  let removedFileName = "";
  let attachmentFound = false;

  await mutateWorkspace((workspace) => {
    const task = workspace.tasks.find((item) => item.id === taskId);
    if (!task) {
      throw new Error("Task not found.");
    }

    const nextAttachments = (task.attachments ?? []).filter((attachment) => {
      if (attachment.id !== attachmentId) return true;
      removedFileName = attachment.fileName;
      attachmentFound = true;
      return false;
    });

    if (!attachmentFound) {
      throw new Error("Attachment not found.");
    }

    task.attachments = nextAttachments;
    task.updatedAt = new Date().toISOString();
    task.updatesCount += 1;
    workspace.activity.unshift({
      id: crypto.randomUUID(),
      actorName: auth.currentUser.name,
      actorColor: auth.currentUser.color,
      action: "removed file from",
      entityType: "task",
      entityTitle: task.title,
      createdAt: new Date().toISOString(),
    });
    workspace.activity = workspace.activity.slice(0, 20);
  }, auth.workspaceId);

  if (!attachmentFound || !removedFileName) {
    return Response.json({ message: "Attachment not found." }, { status: 404 });
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await unlink(path.join(uploadsDir, removedFileName)).catch(() => undefined);

  await emitWorkspaceRefresh(auth.workspaceId);

  return Response.json({ ok: true });
}
