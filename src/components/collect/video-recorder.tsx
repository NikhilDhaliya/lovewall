"use client";

import { AnimatePresence, motion } from "motion/react";
import { Camera, RotateCcw, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { en, type CollectDict } from "@/lib/i18n/collect/en";
import { t } from "@/lib/i18n/collect/languages";
import { baseType, frameOf, pickRecorderType, probeVideo } from "@/lib/media";

export type RecordedVideo = { blob: Blob; type: string; poster: Blob | null; aspect: number; url: string };

const LIMIT = 90; // seconds

type Phase = "idle" | "starting" | "live" | "recording" | "review" | "denied";

// Records in the browser (MP4 where supported, so it plays in Safari), up to 90 s, with retakes. Or upload a file.
export function VideoRecorder({
  value,
  onChange,
  maxMb,
  disabled,
  dict = en,
}: {
  value: RecordedVideo | null;
  onChange: (v: RecordedVideo | null) => void;
  maxMb: number;
  disabled?: boolean;
  dict?: CollectDict;
}) {
  const [phase, setPhase] = useState<Phase>(value ? "review" : "idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const live = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const poster = useRef<Blob | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function stopStream() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  useEffect(
    () => () => {
      stopStream();
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || !pickRecorderType()) {
      setError(dict.errNoRecord);
      return;
    }
    setPhase("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.current = s;
      setPhase("live");
      requestAnimationFrame(() => {
        if (live.current) {
          live.current.srcObject = s;
          void live.current.play().catch(() => {});
        }
      });
    } catch {
      setPhase("denied");
      setError(dict.errCamBlocked);
    }
  }

  function record() {
    const s = stream.current;
    if (!s) return;
    const type = pickRecorderType();
    const rec = new MediaRecorder(s, { mimeType: type, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
    chunks.current = [];
    poster.current = null;
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      const kind = baseType(rec.mimeType || type) || "video/webm";
      const blob = new Blob(chunks.current, { type: kind });
      const v = live.current;
      const aspect = v && v.videoWidth ? v.videoWidth / v.videoHeight : 16 / 9;
      stopStream();
      if (blob.size > maxMb * 1024 * 1024) {
        setError(t(dict, "errVideoTake", { mb: maxMb }));
        setPhase("idle");
        return;
      }
      onChange({ blob, type: kind, poster: poster.current, aspect, url: URL.createObjectURL(blob) });
      setPhase("review");
    };
    rec.start(1000);
    recorder.current = rec;
    setSeconds(0);
    setPhase("recording");
    const started = Date.now();
    // The poster is a frame from about a second in (eyes open, mid-sentence).
    setTimeout(async () => {
      if (live.current) poster.current = await frameOf(live.current, true);
    }, 900);
    timer.current = setInterval(() => {
      const s2 = Math.floor((Date.now() - started) / 1000);
      setSeconds(s2);
      if (s2 >= LIMIT) stop();
    }, 250);
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  function retake() {
    if (value) URL.revokeObjectURL(value.url);
    onChange(null);
    void startCamera();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const type = baseType(file.type);
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(type)) {
      setError(dict.errVideoType);
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      setError(t(dict, "errVideoSize", { mb: maxMb }));
      return;
    }
    try {
      const probe = await probeVideo(file);
      if (probe.duration > 180) {
        setError(dict.errVideoLong);
        return;
      }
      stopStream();
      onChange({ blob: file, type, poster: probe.poster, aspect: probe.aspect, url: URL.createObjectURL(file) });
      setPhase("review");
    } catch {
      setError(dict.errVideoRead);
    }
  }

  const left = Math.max(0, LIMIT - seconds);
  const progress = Math.min(1, seconds / LIMIT);

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-[12px] bg-[#0b0b0c] text-white sm:aspect-video">
        {phase === "review" && value ? (
          <video
            key={value.url}
            src={value.url}
            controls
            playsInline
            className="absolute inset-0 size-full bg-black object-contain"
            aria-label={dict.yourRecording}
          />
        ) : (
          <video
            ref={live}
            muted
            playsInline
            className={cn(
              "absolute inset-0 size-full -scale-x-100 object-cover transition-opacity duration-300",
              phase === "live" || phase === "recording" ? "opacity-100" : "opacity-0",
            )}
          />
        )}

        {(phase === "idle" || phase === "denied" || phase === "starting") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <button
              type="button"
              disabled={disabled || phase === "starting"}
              onClick={startCamera}
              className="flex h-12 items-center gap-2 rounded-[10px] bg-white px-5 text-[15px] font-medium text-black transition-[scale,opacity] active:scale-95 disabled:opacity-60"
            >
              <Camera className="size-[18px]" /> {phase === "starting" ? dict.camStarting : dict.camOn}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileInput.current?.click()}
              className="flex h-10 items-center gap-1.5 rounded-[8px] px-3 text-[14px] text-white/75 transition-colors hover:text-white"
            >
              <Upload className="size-4" /> {dict.uploadVideo}
            </button>
          </div>
        )}

        {(phase === "live" || phase === "recording") && (
          <>
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
              <span
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-[6px] bg-black/45 px-2.5 text-[13px] font-medium tabular-nums backdrop-blur",
                  phase !== "recording" && "opacity-0",
                )}
              >
                <span className="size-2 animate-pulse rounded-full bg-[#ff3b30]" />
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
              </span>
              {phase === "live" && (
                <button
                  type="button"
                  onClick={() => {
                    stopStream();
                    setPhase("idle");
                  }}
                  className="grid size-8 place-items-center rounded-[8px] bg-black/45 backdrop-blur"
                  aria-label={dict.camOff}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="absolute inset-x-0 bottom-0 flex justify-center pb-4">
              <button
                type="button"
                onClick={phase === "recording" ? stop : record}
                aria-label={phase === "recording" ? dict.recStop : dict.recStart}
                className="relative grid size-[68px] place-items-center rounded-full transition-transform active:scale-95"
              >
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 68 68" aria-hidden>
                  <circle cx="34" cy="34" r="31" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="4" />
                  {phase === "recording" && (
                    <circle
                      cx="34"
                      cy="34"
                      r="31"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="4"
                      strokeDasharray={2 * Math.PI * 31}
                      strokeDashoffset={2 * Math.PI * 31 * (1 - progress)}
                      strokeLinecap="round"
                    />
                  )}
                </svg>
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={phase}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    className={cn("block bg-[#ff3b30]", phase === "recording" ? "size-6 rounded-[6px]" : "size-[52px] rounded-full")}
                  />
                </AnimatePresence>
              </button>
            </div>
          </>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {phase === "review" && value && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={retake}
            className="flex h-10 items-center gap-1.5 rounded-[8px] bg-surface px-4 text-[14px] font-medium ring-1 ring-line transition-colors ring-inset hover:bg-surface-2"
          >
            <RotateCcw className="size-4" /> {dict.retake}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileInput.current?.click()}
            className="flex h-10 items-center gap-1.5 rounded-[8px] px-3 text-[14px] text-muted transition-colors hover:text-ink"
          >
            <Upload className="size-4" /> {dict.uploadInstead}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2.5 text-center text-[14px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
