import type { Metadata } from "next";
import { A, Doc, Mail, P, Section, Ul } from "@/components/legal/doc";
import { LEGAL } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  const { contact, product } = LEGAL;
  return (
    <Doc title="Security" lead={`How the hosted ${product} service is protected, and how to tell us when you find something we missed.`}>
      <Section title="How the service is built">
        <Ul>
          <li>Everything travels over TLS. The database and file storage providers encrypt data at rest.</li>
          <li>
            Files live in a private bucket. Browsers upload with one-time signed URLs that accept only the declared type and size; a file is
            served only after a testimonial or space claims it, through short-lived signed links.
          </li>
          <li>
            Sign-in uses a one-time code by email, or GitHub or Google. No passwords are stored. Sessions are stored server-side, so “Sign
            out everywhere” really does.
          </li>
          <li>Every record belongs to a space, and every query is scoped to the space the signed-in person may access.</li>
          <li>
            User content is treated as untrusted everywhere: escaped in pages, widgets and emails. A strict Content Security Policy applies
            to the app and to embeds.
          </li>
          <li>Server-side fetches of links people paste go through a fetcher that refuses private networks and redirects to them.</li>
          <li>Public endpoints are rate limited per IP (hashed) and per space; forms carry a signed timestamp and a honeypot.</li>
          <li>API keys and webhook secrets are hashed or encrypted at rest and shown once.</li>
          <li>Sessions keep a hashed IP, never the address; GitHub and Google tokens are not kept after sign-in.</li>
          <li>Exports and integrations are for a space’s owner; team members’ exports, edits and deletions are logged for a year.</li>
          <li>Payments never touch the service: Polar handles cards.</li>
          <li>The code is open source, so you can read all of this rather than take our word for it.</li>
        </Ul>
      </Section>

      <Section title="Reporting a vulnerability">
        <P>
          Report it privately through{" "}
          <A href="https://github.com/NikhilDhaliya/lovewall/security/advisories/new">GitHub’s vulnerability reporting</A> for the Lovewall
          repository, or email <Mail address={contact.security} />. Tell us what you found, how to reproduce it and what it affects. We
          reply within a week, keep you informed, and credit you when the fix ships if you want. There is no bounty programme, but we are
          grateful and will say so publicly if you like.
        </P>
        <P>Please:</P>
        <Ul>
          <li>test only against accounts you own, and don’t access, change or delete other people’s data;</li>
          <li>don’t run denial-of-service tests or spam the service;</li>
          <li>give us a reasonable time (we aim for 90 days at most) before publishing.</li>
        </Ul>
        <P>
          We will not take legal action against research done in good faith under these rules. The same text is in the repository’s
          SECURITY.md.
        </P>
      </Section>

      <Section title="If something goes wrong">
        <P>
          If a breach affects personal data we tell the people and customers affected without undue delay, with what happened and what we
          are doing, and notify authorities as the law requires. Details are in the <A href="/legal/privacy">Privacy Policy</A> and, for
          business customers, the <A href="/legal/dpa">DPA</A>.
        </P>
      </Section>
    </Doc>
  );
}
