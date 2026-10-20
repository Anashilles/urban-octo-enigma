"use client";

import { useEffect } from "react";
import { create } from "zustand";

interface SaveState {
  pending: number;
  failed: { message: string; retry: (() => Promise<unknown>) | null } | null;
  lastSavedAt: number | null;
}

export const useSaveStatus = create<SaveState>()(() => ({ pending: 0, failed: null, lastSavedAt: null }));

/**
 * Runs a persistence call while reflecting it in the editor's save indicator.
 * Failures keep a retry handle so the user can try again.
 */
export async function trackSave<T>(fn: () => Promise<T>, errorMessage: (e: unknown) => string): Promise<T> {
  useSaveStatus.setState((s) => ({ pending: s.pending + 1, failed: null }));
  try {
    const result = await fn();
    useSaveStatus.setState((s) => ({ pending: s.pending - 1, lastSavedAt: Date.now() }));
    return result;
  } catch (e) {
    useSaveStatus.setState((s) => ({
      pending: s.pending - 1,
      failed: { message: errorMessage(e), retry: () => trackSave(fn, errorMessage) },
    }));
    throw e;
  }
}

/** Warns before leaving the page while saves (or uploads) are still running. */
export function useUnsavedGuard(extraBusy: boolean, message: string) {
  const pending = useSaveStatus((s) => s.pending);
  const busy = pending > 0 || extraBusy;
  useEffect(() => {
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [busy, message]);
}
