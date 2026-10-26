"use client";

import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { inputClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { safeNext } from "@/lib/redirect";

const GITHUB =
  "M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.8 18.3 5.1 18.3 5.1c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z";

export function LoginForm({
  next,
  github,
  google,
  defaultEmail = "",
}: {
  next: string;
  github: boolean;
  google: boolean;
  defaultEmail?: string;
}) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(defaultEmail);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const address = email.trim().toLowerCase();

  function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("That email doesn’t look right.");
      return;
    }
    startTransition(async () => {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email: address, type: "sign-in" });
      if (error) {
        setError(error.status === 429 ? "Too many tries. Wait a minute." : "Couldn’t send a code. Try again.");
        return;
      }
      setCode("");
      setStep("code");
    });
  }

  function verify(value: string) {
    setError(null);
    startTransition(async () => {
      const { error } = await authClient.signIn.emailOtp({ email: address, otp: value });
      if (error) {
        setError(
          error.status === 429
            ? "Too many tries. Wait a minute."
            : error.code === "TOO_MANY_ATTEMPTS"
              ? "Too many wrong codes. Get a new one."
              : "That code didn’t work.",
        );
        setCode("");
        codeRef.current?.focus();
        return;
      }
      window.location.assign(safeNext(next));
    });
  }

  function social(provider: "github" | "google") {
    startTransition(async () => {
      const { error } = await authClient.signIn.social({ provider, callbackURL: safeNext(next) });
      if (error) setError("Couldn’t sign in. Try again.");
    });
  }

  return (
    <div className="w-full max-w-[380px] animate-view">
      <div className="rounded-[12px] bg-surface p-7 ring-1 ring-line sm:p-8">
        {step === "email" ? (
          <form noValidate onSubmit={requestCode} className="space-y-5">
            <div>
              <h1 className="font-display text-[24px] font-medium">Sign in</h1>
              <p className="mt-1 text-[15px] text-muted">We’ll email you a code.</p>
            </div>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              aria-label="Email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(inputClass, "h-12 md:h-12 md:text-[15px]")}
            />
            {error && (
              <p role="alert" className="text-[14px] text-danger">
                {error}
              </p>
            )}
            <button
              disabled={pending || !email}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-accent text-[15px] font-medium text-on-accent transition-[background-color,scale] hover:bg-accent-hover active:scale-[0.98] disabled:opacity-40"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  Continue <ArrowRight className="size-4" />
                </>
              )}
            </button>
            {(github || google) && (
              <>
                <div className="flex items-center gap-3 text-[12px] text-faint">
                  <span className="h-px flex-1 bg-line" />
                  or
                  <span className="h-px flex-1 bg-line" />
                </div>
                <div className="grid gap-2">
                  {github && (
                    <button
                      type="button"
                      onClick={() => social("github")}
                      className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-surface text-[15px] font-medium ring-1 ring-line transition-colors ring-inset hover:bg-surface-2"
                    >
                      <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden>
                        <path d={GITHUB} />
                      </svg>
                      GitHub
                    </button>
                  )}
                  {google && (
                    <button
                      type="button"
                      onClick={() => social("google")}
                      className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-surface text-[15px] font-medium ring-1 ring-line transition-colors ring-inset hover:bg-surface-2"
                    >
                      <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
                        <path
                          fill="currentColor"
                          d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3zM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22zm-5.6-8a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9zM12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z"
                        />
                      </svg>
                      Google
                    </button>
                  )}
                </div>
              </>
            )}
          </form>
        ) : (
          <div className="space-y-5">
            <div>
              <button
                onClick={() => setStep("email")}
                className="mb-3 -ml-1 flex h-8 max-w-full items-center gap-1 rounded-lg px-1 text-[14px] text-muted transition-colors hover:text-ink"
              >
                <ArrowLeft className="size-4 shrink-0" /> <span className="truncate">{email}</span>
              </button>
              <h1 className="font-display text-[24px] font-medium">Check your email</h1>
              <p className="mt-1 text-[15px] text-muted">Enter the 6-digit code.</p>
            </div>
            <input
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              disabled={pending}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(value);
                if (value.length === 6) verify(value);
              }}
              className="h-14 w-full rounded-[10px] bg-surface text-center font-mono text-[26px] tracking-[0.5em] ring-1 ring-line transition-[box-shadow] outline-none ring-inset focus:ring-[1.5px] focus:ring-ink/35"
              placeholder="······"
            />
            {error && (
              <p role="alert" className="text-[14px] text-danger">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between text-[14px]">
              <span className="flex items-center gap-2 text-muted">{pending && <Loader2 className="size-4 animate-spin" />}</span>
              <button
                onClick={() => requestCode()}
                disabled={pending}
                className="h-9 text-muted transition-colors hover:text-ink disabled:opacity-50"
              >
                Send a new code
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
