import type { Metadata } from "next";
import { A, Doc, P, Section, Table } from "@/components/legal/doc";
import { LEGAL } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Cookies" };

export default function CookiesPage() {
  return (
    <Doc
      title="Cookies"
      lead="The service uses only cookies it cannot work without. There are no advertising, analytics or tracking cookies, so there is nothing to consent to and no banner."
    >
      <Section title="The cookies we set">
        <Table
          head={["Name", "What for", "Lasts", "Where"]}
          rows={[
            [
              "lovewall.session_token (prefixed __Secure- over https)",
              "Keeps you signed in. A random token; the session itself is stored on our server",
              `${LEGAL.retention.sessionDays} days, renewed while you use the app`,
              "Signed-in app only",
            ],
            [
              "lovewall.* state cookies set by the sign-in flow (OAuth state, if you use GitHub or Google)",
              "Protects the sign-in from forgery",
              "Minutes",
              "Sign-in only",
            ],
          ]}
        />
        <P>
          Your theme choice (light, dark or system) is kept in your browser’s local storage, not in a cookie, and never leaves your browser.
        </P>
      </Section>

      <Section title="Collect pages, wall pages and widgets">
        <P>
          Public pages and embedded widgets set no cookies at all and store nothing in visitors’ browsers. Widget statistics are counted on
          our server per widget, per day and per website, with no identifier for the visitor. A website that embeds a widget may set its own
          cookies; that is between you and that website.
        </P>
      </Section>

      <Section title="Why no banner">
        <P>
          The EU ePrivacy rules, the UK PECR and similar laws require consent for cookies that are not strictly necessary. Ours are strictly
          necessary, so we do not ask. If that ever changes, this page and the <A href="/legal/privacy">Privacy Policy</A> will change
          first, and we will ask before setting anything new.
        </P>
      </Section>
    </Doc>
  );
}
