"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { parseDate } from "@/lib/date-utils";
import type { BootstrapPayload } from "@/lib/types";

const DEVICE_STORAGE_KEY = "newkanban.device-id";

export interface AuthFormState {
  email: string;
  password: string;
}

export function useWorkspaceSession({
  setSelectedDay,
}: {
  setSelectedDay: (value: Date) => void;
}) {
  const [snapshot, setSnapshot] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [authForm, setAuthForm] = useState<AuthFormState>({ email: "", password: "" });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const deviceIdRef = useRef("");
  const connectedAtRef = useRef(new Date().toISOString());

  const loadBootstrap = useCallback(async () => {
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (response.status === 401) {
        setSnapshot(null);
        setAuthRequired(true);
        setLoading(false);
        return;
      }

      const data = (await response.json()) as BootstrapPayload;
      if (!data.authenticated || !data.currentUser) {
        setSnapshot(null);
        setAuthRequired(true);
        setLoading(false);
        return;
      }
      let externalAgenda = data.externalAgenda ?? [];
      try {
        const externalResponse = await fetch("/api/calendar/external", { cache: "no-store" });
        if (externalResponse.ok) {
          const externalPayload = await externalResponse.json();
          externalAgenda = externalPayload.externalAgenda ?? [];
        }
      } catch {
        // External ICS feeds are optional.
      }
      setSnapshot({ ...data, externalAgenda });
      setAuthRequired(false);
      const current = parseDate(data.serverTime);
      setSelectedDay(current);
    } catch (error) {
      console.error("Failed to load bootstrap state", error);
      setAuthRequired(true);
    } finally {
      setLoading(false);
    }
  }, [setSelectedDay]);

  useEffect(() => {
    const stored = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    const nextDeviceId = stored || crypto.randomUUID();
    window.localStorage.setItem(DEVICE_STORAGE_KEY, nextDeviceId);
    deviceIdRef.current = nextDeviceId;
    void loadBootstrap();
  }, [loadBootstrap]);

  const performAuth = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      let body: Record<string, unknown> = { ...authForm };

      if (mfaChallengeToken) {
        body = {
          challengeToken: mfaChallengeToken,
          otp: mfaCode,
        };
      }

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await safeJson(response);
      if (response.status === 409 && payload?.mfaRequired) {
        setMfaChallengeToken(payload.challengeToken);
        setAuthInfo("Enter the 6-digit MFA code from your authenticator app.");
        return;
      }
      if (!response.ok) {
        throw new Error(payload?.message ?? "Authentication failed.");
      }
      setMfaChallengeToken(null);
      setMfaCode("");
      if (payload?.message) {
        setAuthInfo(payload.message);
      }
      await loadBootstrap();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }, [authForm, loadBootstrap, mfaChallengeToken, mfaCode]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSnapshot(null);
    setAuthRequired(true);
  }, []);

  const requestPasswordReset = useCallback(async () => {
    setAuthError(null);
    setAuthInfo(null);
    const response = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: authForm.email }),
    });
    const payload = await safeJson(response);
    if (!response.ok) {
      setAuthError(payload?.message ?? "Unable to request password reset.");
      return;
    }
    setAuthInfo(payload?.message ?? "Password was reset.");
  }, [authForm.email]);

  return {
    snapshot,
    setSnapshot,
    loading,
    authRequired,
    authForm,
    setAuthForm,
    authError,
    authInfo,
    authBusy,
    mfaChallengeToken,
    mfaCode,
    setMfaCode,
    deviceIdRef,
    connectedAtRef,
    loadBootstrap,
    performAuth,
    logout,
    requestPasswordReset,
  };
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
