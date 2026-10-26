"use client";

import { MotionConfig } from "motion/react";
import { useSyncExternalStore } from "react";

export const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Springs with natural damping: SPRING for layout and indicators, SNAPPY for small controls, SOFT for sheets.
export const SPRING = { type: "spring", stiffness: 520, damping: 44, mass: 1 } as const;
export const SPRING_SNAPPY = { type: "spring", stiffness: 700, damping: 38, mass: 0.8 } as const;
export const SPRING_SOFT = { type: "spring", stiffness: 380, damping: 36, mass: 1 } as const;

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      {children}
    </MotionConfig>
  );
}

function subscribeMedia(query: string) {
  return (cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  };
}

export function useMedia(query: string, server = false) {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => server,
  );
}

export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
