"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import type { AuthenticatedUser, BootstrapPayload, PresenceMember, ViewKey, WorkspaceMember } from "@/lib/types";

export function useWorkspaceRealtime({
  authenticated,
  view,
  deviceIdRef,
  connectedAtRef,
  loadBootstrap,
  onWorkspaceSnapshot,
  onPresenceList,
  onMembersList,
  onAuthUser,
  onSessionRefresh,
}: {
  authenticated: boolean;
  view: ViewKey;
  deviceIdRef: React.MutableRefObject<string>;
  connectedAtRef: React.MutableRefObject<string>;
  loadBootstrap: () => Promise<void>;
  onWorkspaceSnapshot: (workspace: BootstrapPayload["workspace"]) => void;
  onPresenceList: (presence: PresenceMember[]) => void;
  onMembersList: (members: WorkspaceMember[]) => void;
  onAuthUser: (currentUser: AuthenticatedUser) => void;
  onSessionRefresh?: () => Promise<void> | void;
}) {
  const [connectionState, setConnectionState] = useState<"connecting" | "live" | "offline">("offline");
  const [connectionNonce, setConnectionNonce] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef({
    onWorkspaceSnapshot,
    onPresenceList,
    onMembersList,
    onAuthUser,
  });
  const viewRef = useRef(view);

  useEffect(() => {
    handlersRef.current = {
      onWorkspaceSnapshot,
      onPresenceList,
      onMembersList,
      onAuthUser,
    };
  }, [onAuthUser, onMembersList, onPresenceList, onWorkspaceSnapshot]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    if (!authenticated) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = io({ transports: ["websocket", "polling"], reconnection: true });
    socketRef.current = socket;

    const handleConnect = () => {
      setConnectionState("live");
      socket.emit("presence:join", {
        deviceId: deviceIdRef.current,
        currentView: viewRef.current,
        connectedAt: connectedAtRef.current,
      });
    };

    const handleDisconnect = () => setConnectionState("offline");
    const handleSessionRefresh = () => {
      void (async () => {
        await loadBootstrap();
        await onSessionRefresh?.();
      })();
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("workspace:snapshot", (workspace) => handlersRef.current.onWorkspaceSnapshot(workspace));
    socket.on("presence:list", (presence) => handlersRef.current.onPresenceList(presence));
    socket.on("members:list", (members) => handlersRef.current.onMembersList(members));
    socket.on("auth:user", (currentUser) => handlersRef.current.onAuthUser(currentUser));
    socket.on("session:refresh", handleSessionRefresh);

    const heartbeat = window.setInterval(() => {
      socket.emit("presence:heartbeat", {
        deviceId: deviceIdRef.current,
        currentView: viewRef.current,
        connectedAt: connectedAtRef.current,
      });
    }, 15_000);

    return () => {
      window.clearInterval(heartbeat);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("session:refresh", handleSessionRefresh);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [authenticated, connectedAtRef, connectionNonce, deviceIdRef, loadBootstrap, onSessionRefresh]);

  useEffect(() => {
    if (!authenticated || !socketRef.current?.connected) return;
    socketRef.current.emit("presence:view", {
      deviceId: deviceIdRef.current,
      currentView: view,
      connectedAt: connectedAtRef.current,
    });
  }, [authenticated, connectedAtRef, deviceIdRef, view]);

  const emitAck = useCallback((event: string, payload: Record<string, unknown>) => {
    return new Promise<void>((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error("Realtime connection unavailable."));
        return;
      }
      const timeoutId = window.setTimeout(() => {
        reject(new Error(`${event} timed out.`));
      }, 8000);
      socketRef.current.emit(event, payload, (response: { ok: boolean; error?: string }) => {
        window.clearTimeout(timeoutId);
        if (response?.ok) resolve();
        else reject(new Error(response?.error ?? `${event} failed.`));
      });
    });
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setConnectionState("offline");
  }, []);

  const reconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setConnectionState("connecting");
    setConnectionNonce((current) => current + 1);
  }, []);

  return {
    connectionState,
    emitAck,
    disconnect,
    reconnect,
  };
}
