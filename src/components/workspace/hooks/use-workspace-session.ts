"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { parseDate } from "@/lib/date-utils";
import type { BootstrapPayload } from "@/lib/types";

const DEVICE_STORAGE_KEY = "newkanban.device-id";

export interface AuthFormState {
  name: string;
  handle: string;
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
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authForm, setAuthForm] = useState<AuthFormState>({ name: "", handle: "", email: "", password: "" });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
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
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("inviteToken");
    const reset = params.get("resetToken");
    setInviteToken(invite);
    setResetToken(reset);
    if (invite) setAuthMode("signup");
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyToken = params.get("verifyToken");
    if (!verifyToken) return;

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/auth/verify/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: verifyToken }),
        });
        const payload = await safeJson(response);
        if (cancelled) return;
        setAuthInfo(response.ok ? "Email verified successfully." : payload?.message ?? "Unable to verify email.");
        params.delete("verifyToken");
        const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
        window.history.replaceState({}, "", nextUrl);
        await loadBootstrap();
      } catch (error) {
        if (!cancelled) {
          setAuthError(error instanceof Error ? error.message : "Unable to verify email.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadBootstrap]);

  const performAuth = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      let endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/signup";
      let body: Record<string, unknown> = { ...authForm };

      if (inviteToken && authMode === "signup") {
        endpoint = "/api/invites/accept";
        body = {
          token: inviteToken,
          name: authForm.name,
          handle: authForm.handle,
          password: authForm.password,
        };
      }

      if (mfaChallengeToken && authMode === "login") {
        body = {
          challengeToken: mfaChallengeToken,
          otp: mfaCode,
        };
      }

      const response = await fetch(endpoint, {
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
  }, [authForm, authMode, inviteToken, loadBootstrap, mfaChallengeToken, mfaCode]);

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
      body: JSON.stringify({ email: forgotEmail || authForm.email }),
    });
    const payload = await safeJson(response);
    if (!response.ok) {
      setAuthError(payload?.message ?? "Unable to request password reset.");
      return;
    }
    setAuthInfo(payload?.message ?? "Password was reset.");
  }, [authForm.email, forgotEmail]);

  const confirmPasswordReset = useCallback(async () => {
    if (!resetToken) return;
    const response = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: resetToken, password: resetPassword }),
    });
    const payload = await safeJson(response);
    if (!response.ok) {
      setAuthError(payload?.message ?? "Unable to reset password.");
      return;
    }
    setAuthInfo("Password reset complete. You can now sign in.");
    setResetToken(null);
    setResetPassword("");
  }, [resetPassword, resetToken]);

  const requestVerification = useCallback(async () => {
    const response = await fetch("/api/auth/verify/request", { method: "POST" });
    const payload = await safeJson(response);
    if (!response.ok) {
      setAuthError(payload?.message ?? "Unable to issue verification link.");
      return;
    }
    setAuthInfo(`Verification link: ${payload?.verificationLink}`);
  }, []);

  return {
    snapshot,
    setSnapshot,
    loading,
    authRequired,
    authMode,
    setAuthMode,
    authForm,
    setAuthForm,
    authError,
    setAuthError,
    authInfo,
    setAuthInfo,
    authBusy,
    inviteToken,
    resetToken,
    setResetToken,
    mfaChallengeToken,
    setMfaChallengeToken,
    mfaCode,
    setMfaCode,
    forgotEmail,
    setForgotEmail,
    resetPassword,
    setResetPassword,
    deviceIdRef,
    connectedAtRef,
    loadBootstrap,
    performAuth,
    logout,
    requestPasswordReset,
    confirmPasswordReset,
    requestVerification,
  };
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
