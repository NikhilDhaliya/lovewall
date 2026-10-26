import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/ui/logo";
import { oauth } from "@/lib/env";
import { LEGAL, legalEnabled } from "@/lib/legal/config";
import { safeNext } from "@/lib/redirect";
import { currentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage(props: PageProps<"/login">) {
  const { next, email } = await props.searchParams;
  const target = safeNext(next);
  if (await currentUser()) redirect(target);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 pt-safe pb-safe">
      <Link href="/" className="mb-9 rounded-xl" aria-label="Lovewall home">
        <Wordmark size="md" />
      </Link>
      <LoginForm
        next={target}
        github={oauth.github}
        google={oauth.google}
        // Invite links pass the invited address.
        defaultEmail={typeof email === "string" ? email.slice(0, 254) : ""}
      />
      {legalEnabled() && (
        <p className="mt-8 max-w-[340px] text-center text-[13px] leading-relaxed text-balance text-muted">
          By continuing you confirm you are {LEGAL.minimumAge} or older and agree to the{" "}
          <Link href="/legal/terms" className="underline underline-offset-2 hover:text-ink">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-ink">
            Privacy Policy
          </Link>
          .
        </p>
      )}
    </main>
  );
}
