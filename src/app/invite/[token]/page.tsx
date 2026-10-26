import type { Metadata } from "next";
import { headers } from "next/headers";
import { Link } from "@/components/app/link";
import { redirect } from "next/navigation";
import { SpaceTile } from "@/components/app/shell";
import { buttonClass } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/logo";
import { findInvite } from "@/lib/data/members";
import { getMemberSpace } from "@/lib/data/spaces";
import { ipKey } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { currentUser } from "@/lib/session";
import { JoinButton, SwitchAccount } from "./invite-actions";

export const metadata: Metadata = { title: "Invite", robots: { index: false } };

// An invite link from email. Joining needs the invited address (see acceptInvite).
export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const limit = await rateLimit(`invite-view:${ipKey(await headers())}`, 60, 600);
  const invite = limit.ok ? await findInvite(token) : null;
  const user = await currentUser();
  if (invite && user && (await getMemberSpace(user.id, invite.spaceId))) redirect(`/app/${invite.spaceId}`);
  const next = `/invite/${token}`;

  let body: React.ReactNode;
  if (!invite) {
    body = (
      <>
        <h1 className="font-display text-[22px] font-medium">{limit.ok ? "This invite has expired" : "Too many tries"}</h1>
        <p className="mt-1.5 text-[15px] text-muted">{limit.ok ? "Ask for a new one." : "Try again in a few minutes."}</p>
        <Link href={user ? "/app" : "/"} className={buttonClass("secondary", "lg", "mt-6 w-full")}>
          {user ? "Your spaces" : "Lovewall home"}
        </Link>
      </>
    );
  } else {
    const mismatch = user && user.email.toLowerCase() !== invite.email;
    body = (
      <>
        <SpaceTile space={{ name: invite.spaceName, logo: invite.logo }} size={44} />
        <h1 className="mt-4 font-display text-[22px] font-medium break-words">Join {invite.spaceName}</h1>
        <p className="mt-1.5 text-[15px] break-words text-muted">
          {mismatch ? (
            <>
              This invite is for {invite.email}. You’re signed in as {user.email}.
            </>
          ) : (
            <>
              {invite.from} invited {user ? "you" : invite.email}.
            </>
          )}
        </p>
        <div className="mt-6 w-full">
          {!user ? (
            <Link
              href={`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`}
              className={buttonClass("primary", "lg", "w-full")}
            >
              Sign in to join
            </Link>
          ) : mismatch ? (
            <SwitchAccount next={next} email={invite.email} />
          ) : (
            <JoinButton token={token} />
          )}
        </div>
      </>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 pt-safe pb-safe">
      <Link href="/" className="mb-9 rounded-xl" aria-label="Lovewall home">
        <Wordmark size="md" />
      </Link>
      <div className="flex w-full max-w-[380px] animate-view flex-col items-center rounded-[12px] bg-surface p-7 text-center ring-1 ring-line sm:p-8">
        {body}
      </div>
    </main>
  );
}
