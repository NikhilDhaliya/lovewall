// WebVTT captions from timed words (speech-to-text output). Plain module: unit tested.

export type Word = { word: string; start: number; end: number };
export type Cue = { start: number; end: number; text: string };

const MAX_CHARS = 64;
const MAX_SECONDS = 5;

// Short cues that end at a sentence when they can: easy to read on a phone.
export function cuesFromWords(words: Word[]): Cue[] {
  const cues: Cue[] = [];
  let cur: Cue | null = null;
  for (const w of words) {
    const text = w.word.trim();
    if (!text || !Number.isFinite(w.start) || !Number.isFinite(w.end)) continue;
    if (cur && (cur.text.length + 1 + text.length > MAX_CHARS || w.end - cur.start > MAX_SECONDS)) {
      cues.push(cur);
      cur = null;
    }
    if (!cur) cur = { start: w.start, end: w.end, text };
    else {
      cur.text += ` ${text}`;
      cur.end = w.end;
    }
    if (/[.!?…]$/.test(text) && cur.text.length >= 24) {
      cues.push(cur);
      cur = null;
    }
  }
  if (cur) cues.push(cur);
  return cues;
}

export function vttTime(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
}

// Cue text is escaped: a transcript can't add markup or end a cue early.
export function toVtt(cues: Cue[]): string {
  const body = cues
    .map((c, i) => {
      const end = c.end > c.start ? c.end : c.start + 1;
      const text = c.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\s+/g, " ");
      return `${i + 1}\n${vttTime(c.start)} --> ${vttTime(end)}\n${text}`;
    })
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}
