import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { one } from "@/lib/db";
import { formLanguage } from "@/lib/i18n/collect";
import { t } from "@/lib/i18n/collect/languages";
import { emailHash, findInvite } from "@/lib/invites";
import { ipKey } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

// Public: the unsubscribe link in invite emails. A button, not a GET, so link scanners can't unsubscribe anyone.
export default async function UnsubscribePage(props: PageProps<"/i/[token]">) {
  await connection();
  const { token } = await props.params;
  const { done } = await props.searchParams;
  const h = await headers();
  if (!(await rateLimit(`invite-unsub-page:ip:${ipKey(h)}`, 60, 600)).ok) notFound();
  const invite = await findInvite(token, undefined, { expired: true });
  if (!invite) notFound();
  const row = await one<{ space: string; language: string; unsubscribed: boolean }>(
    `select s.name as space, f.language,
            exists (select 1 from invite_suppressions x where x.space_id = s.id and x.email_hash = $2) as unsubscribed
     from spaces s join forms f on f.id = $3 where s.id = $1`,
    [invite.space_id, emailHash(invite.email), invite.form_id],
  );
  if (!row) notFound();
  const { lang, dir, dict } = formLanguage(row.language, h.get("accept-language"));
  const finished = row.unsubscribed || done === "1";
  return (
    <main lang={lang} dir={dir} className="grid min-h-dvh place-items-center bg-canvas px-5">
      <div className="w-full max-w-[400px] py-16 text-center">
        <p className="text-[14px] text-muted">{row.space}</p>
        {finished ? (
          <h1 className="mt-2 font-display text-[24px] leading-snug font-medium text-balance" role="status">
            {t(dict, "unsubDone", { space: row.space })}
          </h1>
        ) : (
          <>
            <h1 className="mt-2 font-display text-[24px] leading-snug font-medium text-balance">
              {t(dict, "unsubTitle", { space: row.space })}
            </h1>
            <p className="mt-2 text-[15px] text-muted" dir="ltr">
              {invite.email}
            </p>
            <form method="post" action={`/api/invites/unsubscribe/${encodeURIComponent(token)}`} className="mt-8">
              <button
                type="submit"
                className="h-11 rounded-[10px] bg-accent px-6 text-[15px] font-medium text-on-accent transition-[background-color,scale] hover:bg-accent-hover active:scale-[0.97]"
              >
                {dict.unsubButton}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
