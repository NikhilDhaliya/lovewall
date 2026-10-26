"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptInvite } from "@/app/actions/members";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function JoinButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await acceptInvite(token);
            if (!res.ok) return setError(res.error);
            router.replace(`/app/${res.data.spaceId}`);
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-label="Joining" /> : "Join"}
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-[14px] text-danger">
          {error}
        </p>
      )}
    </>
  );
}

// Signed in with another address: sign out, then sign in with the invited one and come back here.
export function SwitchAccount({ next, email }: { next: string; email: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="lg"
      className="w-full"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await authClient.signOut();
          window.location.assign(`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(email)}`);
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-label="Signing out" /> : "Switch account"}
    </Button>
  );
}
