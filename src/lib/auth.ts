import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

import type { MemberRole, PermissionSet } from "@/lib/types";
import { normalizeWorkspaceNameInput } from "@/lib/workspace-naming";

export const SESSION_COOKIE_NAME = "nk_session";
export const ACTIVE_WORKSPACE_COOKIE_NAME = "nk_workspace";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
export const DEFAULT_WORKSPACE_ID = process.env.WORKSPACE_ID ?? "visualai-guest";
export const DEFAULT_WORKSPACE_NAME = "VisualAI-Guest";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeHandle(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  return normalized || `user-${randomUUID().slice(0, 8)}`;
}

export function normalizeWorkspaceName(value: string) {
  return normalizeWorkspaceNameInput(value, `${DEFAULT_WORKSPACE_NAME} ${randomUUID().slice(0, 4)}`);
}

export function slugifyWorkspace(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || `workspace-${randomUUID().slice(0, 6)}`;
}

export function makePasswordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, originalDigest] = storedHash.split(":");
  if (!salt || !originalDigest) return false;

  const candidateDigest = scryptSync(password, salt, 64);
  const originalBuffer = Buffer.from(originalDigest, "hex");
  if (candidateDigest.length !== originalBuffer.length) return false;

  return timingSafeEqual(candidateDigest, originalBuffer);
}

export function issueSessionToken() {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getRolePermissions(role: MemberRole): PermissionSet {
  if (role === "owner") {
    return {
      manageMembers: true,
      editWorkspace: true,
      editCalendar: true,
      editNotes: true,
      uploadFiles: true,
      comment: true,
    };
  }

  if (role === "editor") {
    return {
      manageMembers: false,
      editWorkspace: true,
      editCalendar: true,
      editNotes: true,
      uploadFiles: true,
      comment: true,
    };
  }

  return {
    manageMembers: false,
    editWorkspace: false,
    editCalendar: false,
    editNotes: false,
    uploadFiles: false,
    comment: true,
  };
}

export function parseMentions(body: string) {
  return Array.from(new Set((body.match(/@([a-z0-9-]+)/gi) ?? []).map((value) => value.slice(1).toLowerCase())));
}

export function decodeBase32(input: string) {
  const normalized = input.replace(/=+$/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpCode(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const key = decodeBase32(secret);
  const digest = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary =
    ((digest[offset] & 127) << 24) |
    ((digest[offset + 1] & 255) << 16) |
    ((digest[offset + 2] & 255) << 8) |
    (digest[offset + 3] & 255);

  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotpCode(secret: string, code: string) {
  const normalized = code.replace(/\s+/g, "");
  const offsets = [-30_000, 0, 30_000];
  return offsets.some((offset) => generateTotpCode(secret, Date.now() + offset) === normalized);
}

