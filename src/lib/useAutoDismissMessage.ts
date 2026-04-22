"use client";

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

export const NOTICE_TOAST_DISMISS_MS = 4_000;
export const ERROR_TOAST_DISMISS_MS = 7_000;

export function useAutoDismissMessage(
  message: string | null,
  setMessage: Dispatch<SetStateAction<string | null>>,
  delayMs: number,
) {
  useEffect(() => {
    if (!message) return;

    const timeoutId = window.setTimeout(() => setMessage(null), delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayMs, message, setMessage]);
}
