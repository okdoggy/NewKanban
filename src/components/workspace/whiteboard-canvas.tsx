"use client";

import "@excalidraw/excalidraw/index.css";

import dynamic from "next/dynamic";
import type { AppState, BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { Download, Eraser, Plus, Save, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { WhiteboardScene, WhiteboardTemplateEntry, WhiteboardTemplateScene } from "@/lib/types";
import { cn } from "@/lib/utils";

const Excalidraw = dynamic(async () => {
  const mod = await import("@excalidraw/excalidraw");
  return mod.Excalidraw;
}, {
  ssr: false,
  loading: () => <div className="flex h-[720px] items-center justify-center rounded-[28px] bg-white/80 text-sm text-muted-foreground shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]">Loading full whiteboard…</div>,
});

type BuiltinWhiteboardTemplateId = "blank" | "workflow" | "mindmap" | "impact-effort";
type ExcalidrawSceneAppState = NonNullable<Parameters<ExcalidrawImperativeAPI["updateScene"]>[0]["appState"]>;
const DEFAULT_ZOOM = { value: 1 as AppState["zoom"]["value"] };

const BUILTIN_WHITEBOARD_TEMPLATES: { id: BuiltinWhiteboardTemplateId; label: string; }[] = [
  { id: "blank", label: "Blank" },
  { id: "workflow", label: "Workflow" },
  { id: "mindmap", label: "Mind map" },
  { id: "impact-effort", label: "Impact / effort" },
];

const DEFAULT_TEMPLATE_APP_STATE = {
  viewBackgroundColor: "#ffffff",
  theme: "light",
  scrollX: 0,
  scrollY: 0,
} satisfies Partial<AppState>;

const shapeBase = {
  fillStyle: "solid",
  roughness: 0,
  strokeWidth: 2,
};

function sanitizeAppState(appState: Partial<AppState> | Record<string, unknown>) {
  const next = appState as Partial<AppState>;
  return {
    viewBackgroundColor: typeof next.viewBackgroundColor === "string" ? next.viewBackgroundColor : "#ffffff",
    theme: next.theme === "dark" ? "dark" : "light",
    gridSize: typeof next.gridSize === "number" ? next.gridSize : 20,
    zoom: (next.zoom as AppState["zoom"]) ?? DEFAULT_ZOOM,
    scrollX: typeof next.scrollX === "number" ? next.scrollX : 0,
    scrollY: typeof next.scrollY === "number" ? next.scrollY : 0,
  } satisfies Partial<AppState>;
}

function buildSceneAppState(appState: Partial<AppState> | Record<string, unknown>, viewModeEnabled: boolean) {
  return {
    ...sanitizeAppState(appState),
    viewModeEnabled,
  } as ExcalidrawSceneAppState;
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function createTemplateScene(elements: readonly ExcalidrawElement[]): WhiteboardTemplateScene {
  return {
    elements: [...elements],
    appState: DEFAULT_TEMPLATE_APP_STATE,
    files: {},
    version: Date.now(),
    updatedAt: new Date().toISOString(),
  };
}

function buildPersistedScene(elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>): WhiteboardTemplateScene {
  return {
    elements: Array.isArray(elements) ? [...elements] : [],
    appState: sanitizeAppState(appState),
    files: { ...(files ?? {}) },
    version: Date.now(),
    updatedAt: new Date().toISOString(),
  };
}

function sceneFromTemplateScene(scene: WhiteboardTemplateScene, templates: WhiteboardTemplateEntry[], activeTemplateId: string): WhiteboardScene {
  return {
    ...scene,
    activeTemplateId,
    templates,
  };
}

function restoreScene(api: ExcalidrawImperativeAPI, scene: WhiteboardTemplateScene, canEdit: boolean) {
  api.updateScene({
    elements: (scene.elements ?? []) as readonly ExcalidrawElement[],
    appState: buildSceneAppState((scene.appState ?? {}) as Record<string, unknown>, !canEdit),
  });
  const files = Object.values(scene.files ?? {}) as BinaryFileData[];
  if (files.length > 0) api.addFiles(files);
}

function getWorkflowSkeleton() {
  return [
    { type: "text", x: 48, y: 36, text: "Workflow template", fontSize: 30, strokeColor: "#0f172a" },
    { type: "text", x: 48, y: 82, text: "Use this starter to align the current VisualAI flow, key decision gates, and handoffs.", fontSize: 18, strokeColor: "#64748b" },
    {
      type: "ellipse",
      x: 60,
      y: 255,
      width: 118,
      height: 64,
      strokeColor: "#2b4bb9",
      backgroundColor: "#edf3ff",
      ...shapeBase,
      label: { text: "Start", fontSize: 24, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 238,
      y: 208,
      width: 188,
      height: 116,
      strokeColor: "#2b4bb9",
      backgroundColor: "#eef4ff",
      ...shapeBase,
      label: { text: "Discover\\nInputs, goals, users", fontSize: 22, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "diamond",
      x: 496,
      y: 220,
      width: 144,
      height: 92,
      strokeColor: "#c2410c",
      backgroundColor: "#fff1e8",
      ...shapeBase,
      label: { text: "Ready?", fontSize: 22, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 706,
      y: 124,
      width: 194,
      height: 116,
      strokeColor: "#7c3aed",
      backgroundColor: "#f4efff",
      ...shapeBase,
      label: { text: "Design\\nFlows, prompts, UI", fontSize: 22, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 706,
      y: 346,
      width: 194,
      height: 116,
      strokeColor: "#0f766e",
      backgroundColor: "#e9fcf8",
      ...shapeBase,
      label: { text: "Build\\nOwners, tasks, QA", fontSize: 22, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "ellipse",
      x: 964,
      y: 255,
      width: 132,
      height: 70,
      strokeColor: "#0f766e",
      backgroundColor: "#ecfdf5",
      ...shapeBase,
      label: { text: "Review", fontSize: 24, textAlign: "center", verticalAlign: "middle" },
    },
    { type: "arrow", x: 176, y: 286, width: 62, height: 0, strokeColor: "#5770d8", ...shapeBase },
    { type: "arrow", x: 426, y: 266, width: 70, height: 0, strokeColor: "#5770d8", ...shapeBase },
    { type: "arrow", x: 640, y: 258, width: 66, height: -72, strokeColor: "#5770d8", ...shapeBase },
    { type: "arrow", x: 640, y: 274, width: 66, height: 132, strokeColor: "#5770d8", ...shapeBase },
    { type: "arrow", x: 900, y: 182, width: 64, height: 104, strokeColor: "#5770d8", ...shapeBase },
    { type: "arrow", x: 900, y: 404, width: 64, height: -118, strokeColor: "#5770d8", ...shapeBase },
    { type: "text", x: 714, y: 92, text: "Option A", fontSize: 16, strokeColor: "#7c3aed" },
    { type: "text", x: 714, y: 318, text: "Option B", fontSize: 16, strokeColor: "#0f766e" },
  ];
}

function getMindMapSkeleton() {
  return [
    { type: "text", x: 48, y: 36, text: "Mind map template", fontSize: 30, strokeColor: "#0f172a" },
    { type: "text", x: 48, y: 82, text: "Start from one VisualAI challenge and branch outward into themes, ideas, and risks.", fontSize: 18, strokeColor: "#64748b" },
    {
      type: "ellipse",
      x: 468,
      y: 248,
      width: 218,
      height: 118,
      strokeColor: "#2b4bb9",
      backgroundColor: "#eef4ff",
      ...shapeBase,
      label: { text: "Core question\\nWhat are we solving?", fontSize: 24, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 180,
      y: 116,
      width: 180,
      height: 92,
      strokeColor: "#7c3aed",
      backgroundColor: "#f5efff",
      ...shapeBase,
      label: { text: "Users", fontSize: 24, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 182,
      y: 418,
      width: 180,
      height: 92,
      strokeColor: "#0f766e",
      backgroundColor: "#e9fcf8",
      ...shapeBase,
      label: { text: "Pain points", fontSize: 24, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 796,
      y: 116,
      width: 180,
      height: 92,
      strokeColor: "#ea580c",
      backgroundColor: "#fff0e6",
      ...shapeBase,
      label: { text: "Ideas", fontSize: 24, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 796,
      y: 418,
      width: 180,
      height: 92,
      strokeColor: "#be123c",
      backgroundColor: "#ffe8ef",
      ...shapeBase,
      label: { text: "Risks", fontSize: 24, textAlign: "center", verticalAlign: "middle" },
    },
    { type: "arrow", x: 360, y: 196, width: 108, height: 96, strokeColor: "#5770d8", ...shapeBase },
    { type: "arrow", x: 362, y: 462, width: 106, height: -82, strokeColor: "#5770d8", ...shapeBase },
    { type: "arrow", x: 686, y: 292, width: 110, height: -96, strokeColor: "#5770d8", ...shapeBase },
    { type: "arrow", x: 686, y: 380, width: 110, height: 82, strokeColor: "#5770d8", ...shapeBase },
    {
      type: "rectangle",
      x: 74,
      y: 94,
      width: 86,
      height: 58,
      strokeColor: "#7c3aed",
      backgroundColor: "#faf5ff",
      ...shapeBase,
      label: { text: "Creators", fontSize: 16, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 80,
      y: 178,
      width: 86,
      height: 58,
      strokeColor: "#7c3aed",
      backgroundColor: "#faf5ff",
      ...shapeBase,
      label: { text: "Reviewers", fontSize: 16, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 74,
      y: 398,
      width: 92,
      height: 58,
      strokeColor: "#0f766e",
      backgroundColor: "#f0fdfa",
      ...shapeBase,
      label: { text: "Slow handoff", fontSize: 16, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 74,
      y: 482,
      width: 92,
      height: 58,
      strokeColor: "#0f766e",
      backgroundColor: "#f0fdfa",
      ...shapeBase,
      label: { text: "No context", fontSize: 16, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 992,
      y: 94,
      width: 100,
      height: 58,
      strokeColor: "#ea580c",
      backgroundColor: "#fff7ed",
      ...shapeBase,
      label: { text: "Prompt reuse", fontSize: 16, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 994,
      y: 178,
      width: 98,
      height: 58,
      strokeColor: "#ea580c",
      backgroundColor: "#fff7ed",
      ...shapeBase,
      label: { text: "Shared QA", fontSize: 16, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 992,
      y: 398,
      width: 100,
      height: 58,
      strokeColor: "#be123c",
      backgroundColor: "#fff1f2",
      ...shapeBase,
      label: { text: "Bias", fontSize: 16, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 992,
      y: 482,
      width: 100,
      height: 58,
      strokeColor: "#be123c",
      backgroundColor: "#fff1f2",
      ...shapeBase,
      label: { text: "Drift", fontSize: 16, textAlign: "center", verticalAlign: "middle" },
    },
    { type: "arrow", x: 160, y: 124, width: 20, height: 20, strokeColor: "#7c3aed", ...shapeBase },
    { type: "arrow", x: 166, y: 208, width: 14, height: -14, strokeColor: "#7c3aed", ...shapeBase },
    { type: "arrow", x: 166, y: 426, width: 16, height: 18, strokeColor: "#0f766e", ...shapeBase },
    { type: "arrow", x: 166, y: 510, width: 16, height: -18, strokeColor: "#0f766e", ...shapeBase },
    { type: "arrow", x: 976, y: 124, width: 16, height: 0, strokeColor: "#ea580c", ...shapeBase },
    { type: "arrow", x: 976, y: 208, width: 18, height: 0, strokeColor: "#ea580c", ...shapeBase },
    { type: "arrow", x: 976, y: 426, width: 18, height: 0, strokeColor: "#be123c", ...shapeBase },
    { type: "arrow", x: 976, y: 510, width: 18, height: 0, strokeColor: "#be123c", ...shapeBase },
  ];
}

function getImpactEffortSkeleton() {
  return [
    { type: "text", x: 48, y: 36, text: "Impact / effort matrix", fontSize: 30, strokeColor: "#0f172a" },
    { type: "text", x: 48, y: 82, text: "Plot candidate work and discuss what should ship now, later, or not at all.", fontSize: 18, strokeColor: "#64748b" },
    { type: "text", x: 120, y: 116, text: "Impact", fontSize: 22, strokeColor: "#334155" },
    { type: "text", x: 998, y: 420, text: "Effort", fontSize: 22, strokeColor: "#334155" },
    { type: "line", x: 184, y: 154, width: 0, height: 436, strokeColor: "#475569", ...shapeBase },
    { type: "line", x: 184, y: 374, width: 882, height: 0, strokeColor: "#475569", ...shapeBase },
    { type: "text", x: 248, y: 166, text: "Quick wins", fontSize: 24, strokeColor: "#0f766e" },
    { type: "text", x: 740, y: 166, text: "Big bets", fontSize: 24, strokeColor: "#7c3aed" },
    { type: "text", x: 248, y: 430, text: "Fill-ins", fontSize: 24, strokeColor: "#64748b" },
    { type: "text", x: 748, y: 430, text: "Time sinks", fontSize: 24, strokeColor: "#be123c" },
    {
      type: "rectangle",
      x: 274,
      y: 214,
      width: 152,
      height: 84,
      strokeColor: "#0f766e",
      backgroundColor: "#ecfdf5",
      ...shapeBase,
      label: { text: "Shared prompt presets", fontSize: 18, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 450,
      y: 246,
      width: 148,
      height: 84,
      strokeColor: "#0f766e",
      backgroundColor: "#ecfdf5",
      ...shapeBase,
      label: { text: "Comment summaries", fontSize: 18, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 742,
      y: 214,
      width: 168,
      height: 84,
      strokeColor: "#7c3aed",
      backgroundColor: "#f5f3ff",
      ...shapeBase,
      label: { text: "Realtime multi-cursor AI review", fontSize: 18, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 918,
      y: 272,
      width: 130,
      height: 84,
      strokeColor: "#7c3aed",
      backgroundColor: "#f5f3ff",
      ...shapeBase,
      label: { text: "Auto insight engine", fontSize: 18, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 276,
      y: 470,
      width: 146,
      height: 80,
      strokeColor: "#64748b",
      backgroundColor: "#f8fafc",
      ...shapeBase,
      label: { text: "Icon cleanup", fontSize: 18, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 446,
      y: 492,
      width: 138,
      height: 80,
      strokeColor: "#64748b",
      backgroundColor: "#f8fafc",
      ...shapeBase,
      label: { text: "Minor copy polish", fontSize: 18, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 760,
      y: 488,
      width: 152,
      height: 84,
      strokeColor: "#be123c",
      backgroundColor: "#fff1f2",
      ...shapeBase,
      label: { text: "Custom export engine", fontSize: 18, textAlign: "center", verticalAlign: "middle" },
    },
    {
      type: "rectangle",
      x: 934,
      y: 462,
      width: 132,
      height: 84,
      strokeColor: "#be123c",
      backgroundColor: "#fff1f2",
      ...shapeBase,
      label: { text: "Infinite templates", fontSize: 18, textAlign: "center", verticalAlign: "middle" },
    },
  ];
}

function getTemplateSkeleton(templateId: Exclude<BuiltinWhiteboardTemplateId, "blank">) {
  if (templateId === "workflow") return getWorkflowSkeleton();
  if (templateId === "mindmap") return getMindMapSkeleton();
  return getImpactEffortSkeleton();
}

async function buildTemplateScene(templateId: BuiltinWhiteboardTemplateId) {
  if (templateId === "blank") return createTemplateScene([]);
  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
  const elements = convertToExcalidrawElements(
    getTemplateSkeleton(templateId) as Parameters<typeof convertToExcalidrawElements>[0],
    { regenerateIds: true },
  );
  return createTemplateScene(elements as readonly ExcalidrawElement[]);
}

function cloneTemplateScene(scene?: Partial<WhiteboardTemplateScene> | null) {
  return buildPersistedScene(scene?.elements ?? [], (scene?.appState ?? {}) as Record<string, unknown>, (scene?.files ?? {}) as Record<string, unknown>);
}

function normalizeTemplateRegistry(scene?: WhiteboardScene | null) {
  const registry = new Map<string, WhiteboardTemplateEntry>();

  for (const template of BUILTIN_WHITEBOARD_TEMPLATES) {
    registry.set(template.id, {
      id: template.id,
      label: template.label,
      builtIn: true,
      hidden: false,
      scene: template.id === "blank" ? cloneTemplateScene(scene && !Array.isArray(scene.templates) ? scene : null) : null,
    });
  }

  for (const template of scene?.templates ?? []) {
    if (!template?.id || !template.label) continue;
    const existing = registry.get(template.id);
    registry.set(template.id, {
      id: template.id,
      label: template.label,
      builtIn: template.builtIn ?? existing?.builtIn ?? false,
      hidden: Boolean(template.hidden),
      scene: template.scene ? cloneTemplateScene(template.scene) : existing?.scene ?? null,
      createdAt: template.createdAt ?? existing?.createdAt,
      updatedAt: template.updatedAt ?? existing?.updatedAt,
    });
  }

  const templates = [...registry.values()];
  const visibleTemplates = templates.filter((template) => !template.hidden);
  const activeTemplateId = visibleTemplates.some((template) => template.id === scene?.activeTemplateId)
    ? scene?.activeTemplateId ?? visibleTemplates[0]?.id ?? "blank"
    : visibleTemplates[0]?.id ?? "blank";

  return {
    templates,
    activeTemplateId,
  };
}

export function WhiteboardCanvas({ scene, onSceneChange, canEdit, scopeKey, locale: _locale }: { scene?: WhiteboardScene | null; onSceneChange?: (scene: WhiteboardScene, reason?: "auto" | "manual") => void | Promise<void>; canEdit: boolean; scopeKey: string; locale: "en" | "ko"; }) {
  void _locale;
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAppliedSceneRef = useRef("");
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [templateRegistry, setTemplateRegistry] = useState<WhiteboardTemplateEntry[]>(() => normalizeTemplateRegistry(scene).templates);
  const [activeTemplateId, setActiveTemplateId] = useState<string>(() => normalizeTemplateRegistry(scene).activeTemplateId);
  const templateRegistryRef = useRef(templateRegistry);
  const activeTemplateIdRef = useRef(activeTemplateId);
  const scopeKeyRef = useRef(scopeKey);

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as typeof window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
    }
  }, []);

  useEffect(() => {
    scopeKeyRef.current = scopeKey;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setApplyingTemplateId(null);
    const nextState = normalizeTemplateRegistry(scene);
    setTemplateRegistry(nextState.templates);
    setActiveTemplateId(nextState.activeTemplateId);
    templateRegistryRef.current = nextState.templates;
    activeTemplateIdRef.current = nextState.activeTemplateId;
    const activeTemplate = nextState.templates.find((template) => template.id === nextState.activeTemplateId);
    const nextScene = activeTemplate?.scene ?? createTemplateScene([]);
    const serialized = JSON.stringify(sceneFromTemplateScene(nextScene, nextState.templates, nextState.activeTemplateId));
    if (serialized === lastAppliedSceneRef.current) return;
    lastAppliedSceneRef.current = serialized;
    if (!apiRef.current) return;
    restoreScene(apiRef.current, nextScene, canEdit);
  }, [canEdit, scene, scopeKey]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  useEffect(() => {
    templateRegistryRef.current = templateRegistry;
  }, [templateRegistry]);

  useEffect(() => {
    activeTemplateIdRef.current = activeTemplateId;
  }, [activeTemplateId]);

  const persistRegistry = (nextTemplates: WhiteboardTemplateEntry[], nextActiveTemplateId: string, nextActiveScene: WhiteboardTemplateScene, reason: "auto" | "manual" = "auto", expectedScopeKey = scopeKeyRef.current) => {
    if (scopeKeyRef.current !== expectedScopeKey) return;
    const nextWorkspaceScene = sceneFromTemplateScene(nextActiveScene, nextTemplates, nextActiveTemplateId);
    lastAppliedSceneRef.current = JSON.stringify(nextWorkspaceScene);
    setTemplateRegistry(nextTemplates);
    setActiveTemplateId(nextActiveTemplateId);
    templateRegistryRef.current = nextTemplates;
    activeTemplateIdRef.current = nextActiveTemplateId;
    void onSceneChange?.(nextWorkspaceScene, reason);
  };

  const captureCurrentScene = (): WhiteboardTemplateScene => {
    if (!apiRef.current) {
      const fallback = templateRegistryRef.current.find((template) => template.id === activeTemplateIdRef.current)?.scene;
      return fallback ? cloneTemplateScene(fallback) : createTemplateScene([]);
    }
    return buildPersistedScene(
      apiRef.current.getSceneElements(),
      apiRef.current.getAppState() as unknown as Record<string, unknown>,
      apiRef.current.getFiles() as unknown as Record<string, unknown>,
    );
  };

  const saveActiveScene = (nextActiveScene: WhiteboardTemplateScene, nextActiveTemplateId = activeTemplateId, nextRegistry = templateRegistry, expectedScopeKey = scopeKeyRef.current) => {
    const updatedTemplates = nextRegistry.map((template) => (
      template.id === nextActiveTemplateId
        ? { ...template, scene: nextActiveScene, updatedAt: nextActiveScene.updatedAt }
        : template
    ));
    persistRegistry(updatedTemplates, nextActiveTemplateId, nextActiveScene, "auto", expectedScopeKey);
    return updatedTemplates;
  };

  const flushSave = (overrideScene?: WhiteboardTemplateScene, overrideActiveTemplateId?: string, overrideRegistry?: WhiteboardTemplateEntry[], reason: "auto" | "manual" = "manual", expectedScopeKey = scopeKeyRef.current) => {
    if (scopeKeyRef.current !== expectedScopeKey) return;
    if (!onSceneChange) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const nextActiveScene = overrideScene ?? captureCurrentScene();
    const nextActiveId = overrideActiveTemplateId ?? activeTemplateIdRef.current;
    const sourceRegistry = overrideRegistry ?? templateRegistryRef.current;
    const nextTemplates = sourceRegistry.map((template) => (
      template.id === nextActiveId
        ? { ...template, scene: nextActiveScene, updatedAt: nextActiveScene.updatedAt }
        : template
    ));
    persistRegistry(nextTemplates, nextActiveId, nextActiveScene, reason, expectedScopeKey);
  };

  const persistScene = (elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
    if (!onSceneChange) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const scheduledScopeKey = scopeKeyRef.current;
    timeoutRef.current = setTimeout(() => {
      if (scopeKeyRef.current !== scheduledScopeKey) return;
      const nextScene = buildPersistedScene(elements, appState, files);
      const currentRegistry = templateRegistryRef.current;
      const currentActiveTemplateId = activeTemplateIdRef.current;
      const nextTemplates = currentRegistry.map((template) => (
        template.id === currentActiveTemplateId
          ? { ...template, scene: nextScene, updatedAt: nextScene.updatedAt }
          : template
      ));
      const serialized = JSON.stringify(sceneFromTemplateScene(nextScene, nextTemplates, currentActiveTemplateId));
      if (serialized === lastAppliedSceneRef.current) return;
      persistRegistry(nextTemplates, currentActiveTemplateId, nextScene, "auto", scheduledScopeKey);
    }, 500);
  };

  const applyTemplate = async (templateId: string) => {
    if (!canEdit || !apiRef.current || applyingTemplateId) return;
    const expectedScopeKey = scopeKeyRef.current;
    flushSave(undefined, undefined, undefined, "auto", expectedScopeKey);
    const currentScene = captureCurrentScene();
    const currentTemplates = templateRegistryRef.current.map((template) => (
      template.id === activeTemplateIdRef.current
        ? { ...template, scene: currentScene, updatedAt: currentScene.updatedAt }
        : template
    ));
    const builtinTemplate = BUILTIN_WHITEBOARD_TEMPLATES.find((entry) => entry.id === templateId);
    const existingTemplate = currentTemplates.find((template) => template.id === templateId);
    setApplyingTemplateId(templateId);
    try {
      const isBlankTemplate = templateId === "blank";
      const reusingSavedScene = !isBlankTemplate && Boolean(existingTemplate?.scene);
      const nextScene = isBlankTemplate
        ? createTemplateScene([])
        : existingTemplate?.scene
        ? cloneTemplateScene(existingTemplate.scene)
        : builtinTemplate
          ? await buildTemplateScene(builtinTemplate.id)
          : createTemplateScene([]);
      if (scopeKeyRef.current !== expectedScopeKey) return;
      const nextTemplates = currentTemplates.map((template) => (
        template.id === templateId
          ? { ...template, hidden: false, scene: nextScene, updatedAt: nextScene.updatedAt }
          : template
      ));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      restoreScene(apiRef.current, nextScene, canEdit);
      persistRegistry(nextTemplates, templateId, nextScene, "auto", expectedScopeKey);
      if (!reusingSavedScene) {
        window.requestAnimationFrame(() => {
          if (scopeKeyRef.current !== expectedScopeKey) return;
          apiRef.current?.scrollToContent(undefined, { fitToContent: true });
          window.requestAnimationFrame(() => {
            if (scopeKeyRef.current !== expectedScopeKey) return;
            saveActiveScene(captureCurrentScene(), templateId, nextTemplates, expectedScopeKey);
          });
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setApplyingTemplateId(null);
    }
  };

  const createTemplateFromCurrentScene = () => {
    if (!canEdit) return;
    const name = window.prompt("Template name");
    if (!name?.trim()) return;
    const currentScene = captureCurrentScene();
    const currentTemplates = templateRegistry.map((template) => (
      template.id === activeTemplateId
        ? { ...template, scene: currentScene, updatedAt: currentScene.updatedAt }
        : template
    ));
    const nextTemplate: WhiteboardTemplateEntry = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `template-${Date.now()}`,
      label: name.trim(),
      builtIn: false,
      hidden: false,
      scene: createTemplateScene([]),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const nextTemplates = [...currentTemplates, nextTemplate];
    if (apiRef.current && nextTemplate.scene) restoreScene(apiRef.current, nextTemplate.scene, canEdit);
    persistRegistry(nextTemplates, nextTemplate.id, nextTemplate.scene ?? createTemplateScene([]), "auto");
  };

  const restoreBuiltInTemplates = () => {
    const currentScene = captureCurrentScene();
    const nextTemplates = templateRegistry.map((entry) => (
      entry.builtIn ? { ...entry, hidden: false } : entry.id === activeTemplateId ? { ...entry, scene: currentScene, updatedAt: currentScene.updatedAt } : entry
    ));
    persistRegistry(nextTemplates, activeTemplateId, currentScene);
  };

  const deleteTemplate = (templateId: string) => {
    if (!canEdit) return;
    const template = templateRegistry.find((entry) => entry.id === templateId);
    if (!template) return;
    const currentlyVisibleTemplates = templateRegistry.filter((entry) => !entry.hidden);
    if (currentlyVisibleTemplates.length <= 1) {
      window.alert("At least one template must remain visible.");
      return;
    }
    const confirmed = window.confirm(`Delete "${template.label}" template?`);
    if (!confirmed) return;
    flushSave(undefined, undefined, undefined, "auto");
    const currentScene = captureCurrentScene();
    const nextTemplates = templateRegistryRef.current
      .map((entry) => (
        entry.id === activeTemplateIdRef.current
          ? { ...entry, scene: currentScene, updatedAt: currentScene.updatedAt }
          : entry
      ))
      .flatMap((entry) => {
        if (entry.id !== templateId) return [entry];
        if (entry.builtIn) return [{ ...entry, hidden: true }];
        return [];
      });
    const visibleTemplates = nextTemplates.filter((entry) => !entry.hidden);
    const fallbackTemplate = visibleTemplates.find((entry) => entry.id !== templateId) ?? visibleTemplates[0];
    const fallbackScene = fallbackTemplate?.scene ? cloneTemplateScene(fallbackTemplate.scene) : createTemplateScene([]);
    const fallbackActiveTemplateId = fallbackTemplate?.id ?? "blank";
    if (apiRef.current) {
      restoreScene(apiRef.current, fallbackScene, canEdit);
    }
    persistRegistry(nextTemplates, fallbackActiveTemplateId, fallbackScene);
  };

  const exportJson = async () => {
    if (!apiRef.current) return;
    const { serializeAsJSON } = await import("@excalidraw/excalidraw");
    const json = serializeAsJSON(
      apiRef.current.getSceneElements(),
      sanitizeAppState(apiRef.current.getAppState() as Partial<AppState>),
      apiRef.current.getFiles(),
      "local",
    );
    downloadBlob("whiteboard-scene.excalidraw", new Blob([json], { type: "application/json" }));
  };

  const exportSvg = async () => {
    if (!apiRef.current) return;
    const { exportToSvg } = await import("@excalidraw/excalidraw");
    const svg = await exportToSvg({
      elements: apiRef.current.getSceneElements(),
      appState: sanitizeAppState(apiRef.current.getAppState() as Partial<AppState>),
      files: apiRef.current.getFiles(),
      skipInliningFonts: true,
    });
    downloadBlob("whiteboard-scene.svg", new Blob([svg.outerHTML], { type: "image/svg+xml" }));
  };

  const visibleTemplates = templateRegistry
    .filter((template) => !template.hidden)
    .map((template) => ({ id: template.id, label: template.label, kind: template.builtIn ? "builtin" as const : "custom" as const }));

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] bg-white/88 p-4 shadow-[0_18px_44px_rgba(43,75,185,0.06),inset_0_0_0_1px_rgba(195,198,215,0.24)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">Starter templates</p>
          <div className="flex flex-wrap gap-2">
            {canEdit ? <Button onClick={createTemplateFromCurrentScene} size="sm" variant="outline"><Plus className="size-4" />Add</Button> : null}
            {canEdit && templateRegistry.some((template) => template.builtIn && template.hidden) ? <Button onClick={restoreBuiltInTemplates} size="sm" variant="outline">Restore</Button> : null}
            <Button onClick={() => apiRef.current?.scrollToContent(undefined, { fitToContent: true })} size="sm" variant="outline"><ZoomIn className="size-4" />Fit</Button>
            <Button disabled={!canEdit} onClick={() => apiRef.current?.resetScene()} size="sm" variant="outline"><Eraser className="size-4" />Clear</Button>
            {canEdit ? <Button onClick={() => flushSave(undefined, undefined, undefined, "manual")} size="sm" variant="outline"><Save className="size-4" />Save</Button> : null}
            <Button onClick={exportSvg} size="sm" variant="outline"><Download className="size-4" />SVG</Button>
            <Button onClick={exportJson} size="sm" variant="outline"><ZoomOut className="size-4" />JSON</Button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-3">
            {visibleTemplates.map((template) => {
              const busy = applyingTemplateId === template.id;
              return (
                <div className="relative w-[158px] shrink-0" key={template.id}>
                  {canEdit ? (
                    <button
                      className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-muted-foreground transition hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteTemplate(template.id);
                      }}
                      type="button"
                    >
                      <Trash2 className="size-3.5" />
                      <span className="sr-only">Delete template</span>
                    </button>
                  ) : null}
                  <button
                    className={cn(
                      "w-full rounded-[18px] bg-slate-50/90 px-3 py-3 text-left shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)] transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60",
                      template.kind === "builtin" && template.id === "workflow" && "hover:shadow-[0_16px_30px_rgba(43,75,185,0.10)]",
                      template.kind === "builtin" && template.id === "mindmap" && "hover:shadow-[0_16px_30px_rgba(124,58,237,0.10)]",
                      template.kind === "builtin" && template.id === "impact-effort" && "hover:shadow-[0_16px_30px_rgba(15,118,110,0.10)]",
                    )}
                    disabled={!canEdit || applyingTemplateId !== null}
                    onClick={() => void applyTemplate(template.id)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate pr-4 text-sm font-semibold text-foreground">{template.label}</p>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]">
                        {busy ? "Applying" : template.id === activeTemplateId ? "Active" : template.kind === "custom" ? "Saved" : template.id === "blank" ? "Reset" : "Template"}
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="h-[720px] overflow-hidden rounded-[28px] bg-white shadow-[inset_0_0_0_1px_rgba(195,198,215,0.28)]">
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api;
          }}
          initialData={{
            elements: ((templateRegistry.find((template) => template.id === activeTemplateId)?.scene?.elements ?? scene?.elements) ?? []) as readonly ExcalidrawElement[],
            appState: { ...((templateRegistry.find((template) => template.id === activeTemplateId)?.scene?.appState ?? scene?.appState) ?? {}), viewModeEnabled: !canEdit },
            files: ((templateRegistry.find((template) => template.id === activeTemplateId)?.scene?.files ?? scene?.files) ?? {}) as BinaryFiles,
          }}
          onChange={(elements, appState, files) => persistScene(elements, appState as unknown as Record<string, unknown>, files as unknown as Record<string, unknown>)}
          renderTopRightUI={() => null}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, saveAsImage: false } }}
          viewModeEnabled={!canEdit}
        />
      </div>
    </div>
  );
}
