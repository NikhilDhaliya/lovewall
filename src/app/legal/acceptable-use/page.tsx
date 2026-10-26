import type { Metadata } from "next";
import { A, Doc, Mail, P, Section, Ul } from "@/components/legal/doc";
import { LEGAL } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Acceptable Use" };

export default function AcceptableUsePage() {
  const { contact, product } = LEGAL;
  return (
    <Doc
      title="Acceptable Use Policy"
      lead={`${product} exists to show real praise from real customers. These rules keep it that way. They are part of the Terms of Service.`}
    >
      <Section title="Testimonials must be real">
        <P>
          In the United States the FTC’s rule on consumer reviews and testimonials (16 CFR Part 465) makes most of this federal law, with
          penalties per violation. Similar rules exist in the EU, UK, India and elsewhere. On the service you must not:
        </P>
        <Ul>
          <li>
            write, buy, generate (including with AI) or publish a testimonial from someone who did not actually use your product or service;
          </li>
          <li>
            publish a testimonial as a customer’s when it was written by you, an employee, a relative or an agent, unless that relationship
            is clearly disclosed next to it;
          </li>
          <li>
            pay or reward people for a testimonial on the condition that it is positive or says particular things. A reward for leaving
            honest feedback, whatever it says, is allowed if the testimonial discloses it; the rewards feature does this for you;
          </li>
          <li>edit a testimonial so it says something the author did not say. Fixing typos and shortening with “…” is fine;</li>
          <li>show only your good reviews while claiming the display is complete or representative;</li>
          <li>threaten or pressure anyone to remove or change a testimonial;</li>
          <li>present a page you control as an independent review site.</li>
        </Ul>
      </Section>

      <Section title="Imports">
        <P>
          When you import a review from another site (X, LinkedIn, Google, G2, Trustpilot, Product Hunt and the rest) or paste one by hand,
          you confirm that you have the right to republish it, that it is reproduced accurately with the author’s name and a link to the
          original, and that you will remove it if the author or the source asks. Don’t import reviews about a different product and present
          them as yours.
        </P>
      </Section>

      <Section title="Invitations and email">
        <Ul>
          <li>Invite only people who are your customers or who have agreed to hear from you. Never upload bought or scraped lists.</li>
          <li>
            Every invitation carries your name and an unsubscribe link; do not try to remove or defeat them. Opt-outs are honoured by the
            service automatically and permanently.
          </li>
          <li>Do not send more reminders than the product allows, and stop when someone asks.</li>
          <li>Do not invite children (see the Privacy Policy for the ages that apply).</li>
        </Ul>
      </Section>

      <Section title="Content">
        <P>You must not use the service to publish or collect content that:</P>
        <Ul>
          <li>is illegal where you or your visitors are, or infringes someone’s copyright, trademark, privacy or publicity rights;</li>
          <li>is defamatory, harassing, hateful or sexually explicit;</li>
          <li>
            contains personal data of someone who has not agreed to its publication, beyond the name, title, company and photo they gave on
            the form;
          </li>
          <li>contains malware, phishing or misleading links;</li>
          <li>promotes products or services that are illegal to sell to the audience it reaches.</li>
        </Ul>
      </Section>

      <Section title="The service itself">
        <Ul>
          <li>
            Do not probe, overload or attack the service or try to get around rate limits. See the <A href="/legal/security">Security</A>{" "}
            page for how to report a vulnerability instead.
          </li>
          <li>Do not scrape other customers’ pages or the API beyond what the public endpoints offer.</li>
          <li>
            Do not resell the hosted service or let others use your account as their own. (Running your own copy of the open-source code is
            always allowed.)
          </li>
          <li>Do not use the API or integrations to collect data about people who have not agreed.</li>
        </Ul>
      </Section>

      <Section title="What happens if you break this">
        <P>
          Depending on how bad it is, we ask you to fix it, hide the content, suspend the account or end it, as described in the Terms.
          Where the law requires, we report it. To report content or a testimonial that breaks these rules, use the “Report” link under a
          wall page or widget or email <Mail address={contact.legal} />.
        </P>
      </Section>
    </Doc>
  );
}
