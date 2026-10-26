import { headers } from "next/headers";
import { after } from "next/server";
import { LegalLinks } from "@/components/legal/legal-links";
import { LogoMark } from "@/components/ui/logo";
import { grammarOn } from "@/lib/ai/settings";
import { one } from "@/lib/db";
import { fileUrl } from "@/lib/data/files";
import { countView } from "@/lib/data/forms";
import { env } from "@/lib/env";
import { formToken } from "@/lib/form-token";
import { legalEnabled } from "@/lib/legal/config";
import { toPublicForm, type FormConfig } from "@/lib/forms";
import { formLanguage } from "@/lib/i18n/collect";
import { findInvite, markInvite } from "@/lib/invites";
import { ipKey } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { storageConfigured } from "@/lib/storage";
import type { Space } from "@/lib/types";
import { CollectForm } from "./collect-form";

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|slack|discord|curl|wget|python/i;

// The public page of one form: its language, the invite prefill (?i=<signed token>), and a view counted per day.
export async function CollectPage({ space, form, invite: inviteToken }: { space: Space; form: FormConfig; invite?: string | string[] }) {
  const h = await headers();
  const { lang, dir, dict } = formLanguage(form.language, h.get("accept-language"));
  const invite = typeof inviteToken === "string" ? await findInvite(inviteToken, space.id) : null;
  const ip = ipKey(h);
  const ua = h.get("user-agent") ?? "";
  // Count real visitors only: no bots, and at most a few views per visitor per hour (nothing about them is kept).
  after(async () => {
    if (ua && !BOT.test(ua) && (await rateLimit(`view:${ip}:${form.id}`, 3, 3600)).ok) await countView(form.id).catch(() => {});
    if (invite && (await rateLimit(`invite-click:${ip}`, 60, 600)).ok) await markInvite(invite.id, "clicked").catch(() => {});
  });
  const wall = await one<{ id: string }>("select id from widgets where space_id = $1 and type = 'wall' order by created_at limit 1", [
    space.id,
  ]);
  return (
    <main lang={lang} dir={dir} className="min-h-dvh bg-canvas">
      <div className="mx-auto w-full max-w-[520px] px-5 pt-10 pb-10 sm:pt-16">
        <CollectForm
          token={formToken(space.id)}
          maxVideoMb={env.maxVideoMb}
          dict={dict}
          dir={dir}
          lang={lang}
          polish={await grammarOn(space.id)}
          form={toPublicForm(form)}
          invite={invite ? { token: inviteToken as string, name: invite.name, email: invite.email } : null}
          space={{
            id: space.id,
            name: space.name,
            logo: fileUrl(space.logo_key),
            uploads: storageConfigured(),
            website: space.website,
            wallUrl: wall ? `${env.appUrl}/w/${wall.id}` : null,
            privacyUrl: legalEnabled() ? `${env.appUrl}/legal/privacy` : null,
          }}
        />
        <footer className="mt-8 flex items-center justify-center gap-1">
          <LegalLinks
            only={["Privacy"]}
            absolute
            linkClassName="rounded-[8px] px-3 py-2 text-[12px] font-medium text-faint transition-colors hover:text-muted"
          />
          <a
            href={`${env.appUrl}/?ref=collect`}
            className="flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-[12px] font-medium text-faint transition-colors hover:text-muted"
          >
            <LogoMark size={14} /> {dict.poweredBy}
          </a>
        </footer>
      </div>
    </main>
  );
}
