"use client";

import { useEffect } from "react";
import { applyTheme, readPref, resolve } from "@/lib/theme";

// Keeps "System" in step with the device and syncs other tabs.
export function ThemeSync() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const pref = readPref();
      applyTheme(resolve(pref), pref);
    };
    sync();
    mq.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return null;
}
