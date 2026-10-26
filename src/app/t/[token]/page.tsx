import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { GiverManage } from "@/components/privacy/giver-manage";
import { one } from "@/lib/db";
import { fileUrl } from "@/lib/data/files";
import { formLanguage } from "@/lib/i18n/collect";
import { t } from "@/lib/i18n/collect/languages";
import { ipKey } from "@/lib/ip";
import { legalEnabled } from "@/lib/legal/config";
import { findByGiverToken } from "@/lib/privacy";
import { rateLimit } from "@/lib/rate-limit";

export const metadata: Metadata = { title: "Your testimonial", robots: { index: false, follow: false } };

type Consent = { consent_text: string | null; consent_at: string | null; consent_lang: string | null };

// Public: a giver's private page (the link in their receipt email). See, change or delete their testimonial.
export default async function GiverPage(props: PageProps<"/t/[token]">) {
  await connection();
  const { token } = await props.params;
  const h = await headers();
  const allowed = (await rateLimit(`giver-page:ip:${ipKey(h)}`, 60, 600)).ok;
  const view = allowed ? await findByGiverToken(token) : null;
  const t0 = view?.testimonial as (NonNullable<typeof view>["testimonial"] & Consent) | undefined;
  // The language the giver saw the form in (else the form's, else their browser's).
  const form = t0?.form_id ? await one<{ language: string }>("select language from forms where id = $1", [t0.form_id]) : null;
  const { lang, dir, dict } = formLanguage(t0?.consent_lang || form?.language || "auto", h.get("accept-language"));
  const date = t0?.consent_at
    ? `${new Intl.DateTimeFormat(lang, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(t0.consent_at))} UTC`
    : null;
  return (
    <main lang={lang} dir={dir} className="min-h-dvh bg-canvas">
      <div className="mx-auto w-full max-w-[520px] px-5 pt-10 pb-16 sm:pt-16">
        {/* Same place in the tree whether the testimonial exists or not: right after a delete the page re-renders
            without it, and the component keeps showing "deleted" instead of "expired". */}
        <GiverManage
          token={token}
          dict={dict}
          privacyUrl={legalEnabled() ? "/legal/privacy" : null}
          view={
            view && t0
              ? {
                  title: t(dict, "manageTitle", { space: view.space.name }),
                  space: view.space.name,
                  logo: fileUrl(view.space.logo_key),
                  initial: {
                    name: t0.name === "Anonymous" ? "" : t0.name,
                    title: t0.title ?? "",
                    company: t0.company ?? "",
                    text: t0.text,
                    rating: t0.rating,
                    status: t0.status,
                    video: Boolean(t0.video_key),
                    photo: fileUrl(t0.avatar_key),
                  },
                  consent: t0.consent_text && date ? { text: t0.consent_text, date } : null,
                }
              : null
          }
        />
      </div>
    </main>
  );
}
