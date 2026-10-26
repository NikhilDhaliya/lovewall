"use client";

import { flushSync } from "react-dom";
import { THEME_KEY as KEY } from "./theme-boot";

// Appearance: "system" follows the device; "light" and "dark" pin it. Stored per device.
export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const CANVAS: Record<Theme, string> = { light: "#ffffff", dark: "#000000" };

export function readPref(): ThemePref {
  try {
    const p = localStorage.getItem(KEY);
    return p === "light" || p === "dark" ? p : "system";
  } catch {
    return "system";
  }
}

export function resolve(pref: ThemePref): Theme {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme, pref: ThemePref) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themePref = pref;
  window.dispatchEvent(new Event("lovewall-theme"));
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.removeAttribute("media");
    meta.content = CANVAS[theme];
  }
}

export function setTheme(pref: ThemePref) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  flushSync(() => applyTheme(resolve(pref), pref));
  try {
    localStorage.setItem(KEY, pref);
  } catch {}
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
}

export function subscribeTheme(cb: () => void) {
  window.addEventListener("lovewall-theme", cb);
  return () => window.removeEventListener("lovewall-theme", cb);
}

export function currentPref(): ThemePref {
  const p = document.documentElement.dataset.themePref;
  return p === "light" || p === "dark" ? p : "system";
}
