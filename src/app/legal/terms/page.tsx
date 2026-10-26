// Lawyer review: a lawyer should review this page before launch. Operator values live in src/lib/legal/config.ts.
import type { Metadata } from "next";
import { A, Doc, Mail, Ol, OwnerNote, P, Section, Ul } from "@/components/legal/doc";
import { courtsText, LEGAL } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  const { product, operator, domain, contact, plan, changeNoticeDays, liabilityFloorUsd, minimumAge, retention } = LEGAL;
  return (
    <Doc
      title="Terms of Service"
      lead={`These terms are the agreement between you and ${operator} for the hosted ${product} service at ${domain}. Short version: your content stays yours, be honest with testimonials, pay for what you use, and we keep our side of the bargain or you can leave with your data.`}
    >
      <Section title="1. Who this applies to">
        <P>
          The hosted service at {domain} (“the service”) is operated by {operator} (“we”, “us”). By creating an account or using the service
          you agree to these terms, the <A href="/legal/privacy">Privacy Policy</A> and the{" "}
          <A href="/legal/acceptable-use">Acceptable Use Policy</A>. If you use the service for a company, you confirm you may bind it, and
          “you” means the company.
        </P>
        <P>
          {product} is also open-source software under the AGPL-3.0 licence. If you run your own copy, these terms do not apply to it: the
          licence does, and you are the operator of your instance.
        </P>
      </Section>

      <Section title="2. Your account">
        <Ul>
          <li>You must be at least {minimumAge} years old.</li>
          <li>Give a real email address. We use it to sign you in and to tell you about your account.</li>
          <li>
            Sign-in codes and links are yours to protect. Tell us at once at <Mail address={contact.security} /> if you think someone else
            used them.
          </li>
          <li>If you add team members to a space, they act on your behalf inside that space. You are responsible for what they do.</li>
        </Ul>
      </Section>

      <Section title="3. Your content">
        <P>
          Testimonials, names, photos, videos, logos, imported reviews, answers and everything else you put into the service is your
          content. You own it. We claim no rights to it.
        </P>
        <P>
          To run the service we need your permission to store, copy, process and show your content wherever you choose to show it (your
          collect pages, wall pages, widgets, embeds, exports, the API and integrations you turn on). You give us that permission for as
          long as the content is in your account.
        </P>
        <P>You are responsible for your content. In particular:</P>
        <Ul>
          <li>
            You have the right to publish every testimonial you publish. For testimonials collected through the service, the person gave
            consent on the form. For reviews you import or add by hand, you must have the right to use them, and you must keep them accurate
            and attributed.
          </li>
          <li>
            People who gave you a testimonial can ask you, or us, to remove it. You will honour such requests promptly. We may remove a
            testimonial ourselves when its author asks us to and you do not act within 7 days.
          </li>
          <li>Your content does not infringe anyone’s rights, is not illegal and follows the Acceptable Use Policy.</li>
        </Ul>
      </Section>

      <Section title="4. Plans, trial and payment">
        <Ul>
          <li>
            New accounts get a free trial of {plan.trialDays} days. No card is needed to start. When the trial ends, your dashboard asks you
            to subscribe; your published widgets, wall pages and collect pages keep working while you decide.
          </li>
          <li>
            The paid plan costs US ${plan.monthlyUsd} per month or US ${plan.yearlyUsd} per year, plus any tax that applies where you are.
            Prices are shown before you pay.
          </li>
          <li>
            Payments are handled by Polar Software Inc. as merchant of record. Polar sells you the subscription, charges your card, issues
            invoices and handles tax. Polar’s terms apply to the payment itself. We never see your full card number.
          </li>
          <li>Subscriptions renew automatically at the end of each period until you cancel.</li>
          <li>
            We may change prices. A change applies to you only from your next renewal, and only after at least {changeNoticeDays} days’
            notice by email, so you can cancel first.
          </li>
          <li>
            Cancellation and refunds are described in the <A href="/legal/refunds">Refunds and cancellation</A> page.
          </li>
        </Ul>
      </Section>

      <Section title="5. Your data">
        <P>
          How we handle personal data is set out in the <A href="/legal/privacy">Privacy Policy</A>. We do not sell personal data and we do
          not use your content to advertise to anyone. If you are a business, the <A href="/legal/dpa">Data Processing Agreement</A> is part
          of these terms.
        </P>
        <P>
          You can export everything in your account and delete the account yourself, at any time, from your account settings. See section 9
          for what happens to data when the agreement ends.
        </P>
      </Section>

      <Section title="6. Open source and our name">
        <P>
          The service runs the public {product} source code, licensed under the AGPL-3.0. The licence lets you use, change and run that
          code, including to run your own service. It does not cover the {product} name and logo, which belong to {operator}; please don’t
          present your own service as ours.
        </P>
      </Section>

      <Section title="7. Availability and changes to the service">
        <Ul>
          <li>
            We aim to keep the service up all the time, but we do not promise it. It is run by a small operator on third-party
            infrastructure. There will be maintenance, outages and bugs.
          </li>
          <li>
            We may add, change or remove features. If we remove something you rely on, we give at least {changeNoticeDays} days’ notice.
          </li>
          <li>Features marked as beta or experimental can change or disappear without notice.</li>
          <li>
            Fair-use limits (spaces, widgets, submissions per day, file sizes) exist to keep the service fast and are shown in the product.
          </li>
        </Ul>
      </Section>

      <Section title="8. Suspension">
        <P>We may suspend or restrict an account, after telling you unless the law or an emergency stops us, when:</P>
        <Ul>
          <li>it breaks these terms or the Acceptable Use Policy;</li>
          <li>a payment fails and is not fixed within 14 days;</li>
          <li>it is used to attack the service, other users or anyone else;</li>
          <li>the law or a court requires it.</li>
        </Ul>
        <P>We lift the suspension as soon as the reason is gone. For minor problems we ask you to fix them first.</P>
      </Section>

      <Section title="9. Ending the agreement">
        <Ul>
          <li>You can end it at any time by deleting your account in settings. Your subscription is cancelled with it.</li>
          <li>
            We can end it with {changeNoticeDays} days’ notice by email, or at once for a serious breach that is not fixed after we point it
            out, or if we stop offering the service (then we refund any prepaid, unused period).
          </li>
          <li>
            When the agreement ends, your public pages and widgets stop. You have {retention.deletedAccountDays} days to export your data if
            you have not deleted the account yourself; after that we delete it. Backups are overwritten within a further{" "}
            {retention.deletedAccountDays} days.
          </li>
          <li>Sections 3, 10, 11, 12, 14 and 15 continue to apply after the agreement ends.</li>
        </Ul>
      </Section>

      <Section title="10. No warranty">
        <P>
          The service is provided “as is” and “as available”. To the extent the law allows, we make no promises about it: not that it is
          error-free, secure, uninterrupted, fit for a particular purpose, or that it will meet your requirements. Where a law gives you
          guarantees that cannot be excluded, those guarantees apply and nothing here limits them.
        </P>
      </Section>

      <Section title="11. Limitation of liability">
        <P>To the extent the law allows:</P>
        <Ul>
          <li>
            Our total liability to you for everything arising out of the service in any 12-month period is limited to the fees you paid us
            for the service in the 12 months before the event giving rise to the claim, or US ${liabilityFloorUsd}, whichever is greater.
          </li>
          <li>
            We are not liable for indirect or consequential loss: lost profit, lost revenue, lost data (beyond our duty to let you export
            it), lost business or goodwill, or the cost of substitute services.
          </li>
          <li>
            We are not liable for what your testimonial givers write, for reviews you import, for how your visitors use your pages, or for
            third-party services (Polar, sign-in providers, your own website).
          </li>
        </Ul>
        <P>
          Nothing in these terms limits liability for fraud, for death or personal injury caused by negligence, or for anything else that
          cannot be limited by law. If you are a consumer, your statutory rights under the laws of your country are not affected.
        </P>
      </Section>

      <Section title="12. Indemnity">
        <P>
          If someone brings a claim against us because of your content, your use of the service in breach of these terms, or testimonials
          you published without the right to do so, you will cover our reasonable costs and any damages from that claim. We will tell you
          about the claim promptly and let you handle its defence, and we will not settle it on your behalf without your agreement.
        </P>
      </Section>

      <Section title="13. Third-party services">
        <P>
          Payments go through Polar. Optional sign-in goes through GitHub or Google. Integrations you turn on (webhooks, Slack, Zapier,
          Make, the API) send your data where you point them. Each of these has its own terms, and we are not responsible for them. Your
          embed runs on your website under your terms with your visitors.
        </P>
      </Section>

      <Section title="14. Changes to these terms">
        <P>
          We may change these terms. For a change that reduces your rights or adds obligations, we email account holders at least{" "}
          {changeNoticeDays} days before it takes effect and show the new effective date at the top of this page. If you do not agree,
          cancel before that date; using the service after it means you accept the change. Fixes of typos, clarifications and changes
          required by law can take effect at once.
        </P>
      </Section>

      <Section title="15. Governing law and disputes">
        <P>
          These terms are governed by the laws of {LEGAL.jurisdiction.country}. Disputes go to {courtsText()}, which have exclusive
          jurisdiction. If you are a consumer in a country whose law gives you the right to sue at home or protections that cannot be
          waived, you keep those rights.
        </P>
        <P>
          Before going to court, write to <Mail address={contact.legal} />. We will try to sort it out with you within 30 days.
        </P>
        {!LEGAL.jurisdiction.city && <OwnerNote>Owner: set the city in config.ts (jurisdiction.city) before launch.</OwnerNote>}
      </Section>

      <Section title="16. General">
        <Ol>
          <li>
            These terms, the Privacy Policy, the Acceptable Use Policy, the Refunds page and (for businesses) the DPA are the whole
            agreement between us.
          </li>
          <li>If a part of these terms is found invalid, the rest still applies.</li>
          <li>If we do not enforce a term at some point, we can still enforce it later.</li>
          <li>
            You may not transfer this agreement to someone else without our written consent. We may transfer it to a successor who takes
            over the service, with notice to you.
          </li>
          <li>
            Notices to you go to your account email. Notices to us go to <Mail address={contact.legal} />.
          </li>
          <li>Neither side is liable for failing to perform because of events outside its reasonable control.</li>
        </Ol>
      </Section>

      <Section title="17. Contact">
        <P>
          {operator}, operator of {product}. Legal: <Mail address={contact.legal} />. Support: <Mail address={contact.support} />. Privacy:{" "}
          <Mail address={contact.privacy} />. Security: <Mail address={contact.security} />.
          {LEGAL.postalAddress ? ` Postal address: ${LEGAL.postalAddress}.` : " A postal address is available on request."}
        </P>
      </Section>
    </Doc>
  );
}
