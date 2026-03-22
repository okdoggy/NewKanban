export interface NewKanbanRealtimeBridge {
  emitSessionRefresh?: () => void | Promise<void>;
  emitWorkspaceRefresh?: (workspaceId: string) => void | Promise<void>;
}

function getBridge() {
  return (process as typeof process & { __newkanbanRealtimeBridge?: NewKanbanRealtimeBridge }).__newkanbanRealtimeBridge;
}

export async function emitSessionRefresh() {
  await getBridge()?.emitSessionRefresh?.();
}

export async function emitWorkspaceRefresh(workspaceId: string | undefined | null) {
  if (!workspaceId) return;
  await getBridge()?.emitWorkspaceRefresh?.(workspaceId);
}
