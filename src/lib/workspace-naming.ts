const LEGACY_GUEST_PREFIX = /^VisualAI-Guest-?/i;

export function formatWorkspaceName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "Workspace";

  if (/^VisualAI-Guest$/i.test(trimmed)) {
    return "VisualAI";
  }

  return trimmed.replace(LEGACY_GUEST_PREFIX, "").trim() || trimmed;
}

export function normalizeWorkspaceNameInput(name: string, fallback = "Workspace") {
  const collapsed = name.trim().replace(/\s+/g, " ");
  return collapsed || fallback;
}

export function matchesWorkspaceQuery(input: { name: string; id: string }, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const displayName = formatWorkspaceName(input.name).toLowerCase();
  const rawName = input.name.toLowerCase();
  const slug = input.id.toLowerCase();

  return [displayName, rawName, slug].some((value) => value.includes(normalizedQuery));
}
