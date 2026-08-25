"use client";

import { useCallback } from "react";

const ANNOUNCER_ID = "a11y-live-announcer";

function ensureAnnouncer(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let announcer = document.getElementById(ANNOUNCER_ID);
  if (!announcer) {
    announcer = document.createElement("div");
    announcer.id = ANNOUNCER_ID;
    announcer.setAttribute("role", "status");
    announcer.setAttribute("aria-live", "polite");
    announcer.setAttribute("aria-atomic", "true");
    announcer.style.position = "absolute";
    announcer.style.width = "1px";
    announcer.style.height = "1px";
    announcer.style.margin = "-1px";
    announcer.style.padding = "0";
    announcer.style.overflow = "hidden";
    announcer.style.clipPath = "rect(0 0 0 0)";
    announcer.style.whiteSpace = "nowrap";
    announcer.style.border = "0";
    document.body.appendChild(announcer);
  }
  return announcer;
}

export interface UseAnnounceResult {
  announce: (message: string) => void;
}

export function useAnnounce(): UseAnnounceResult {
  const announce = useCallback((message: string) => {
    if (!message.trim()) return;
    const announcer = ensureAnnouncer();
    if (!announcer) return;
    announcer.textContent = "";
    window.requestAnimationFrame(() => {
      announcer.textContent = message;
    });
  }, []);

  return { announce };
}
