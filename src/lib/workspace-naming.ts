export function formatWorkspaceName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "Workspace";
  return trimmed;
}

export function normalizeWorkspaceNameInput(name: string, fallback = "Workspace") {
  const collapsed = name.trim().replace(/\s+/g, " ");
  return collapsed || fallback;
}

