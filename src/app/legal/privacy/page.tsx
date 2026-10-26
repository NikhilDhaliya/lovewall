import type { Metadata } from "next";
import { A, Doc, Mail, P, Section, Table, Ul } from "@/components/legal/doc";
import { LEGAL, serviceHost } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  const { product, operator, contact, minimumAge, retention: r } = LEGAL;
  const domain = serviceHost();
  return (
    <Doc
      title="Privacy Policy"
      lead={`What the hosted ${product} service at ${domain} collects, why, who sees it, how long we keep it, and what you can do about it. We collect what the product needs and nothing for advertising. We never sell personal data.`}
    >
      <Section title="1. Who is responsible">
        <P>
          {operator} operates the service and is the data controller (in India: the data fiduciary) for account holders, for visitors to{" "}
          {domain}, and for the security data described below. Contact: <Mail address={contact.privacy} />.
        </P>
        <P>
          Customers use the service to collect and publish testimonials. For the people who give those testimonials, the customer is the
          controller and we process the data on the customer’s instructions under our <A href="/legal/dpa">Data Processing Agreement</A>. If
          you gave a testimonial to a business and want it changed or removed, the fastest route is that business; you can also write to us
          and we will act (section 8).
        </P>
      </Section>

      <Section title="2. Who this covers">
        <Ul>
          <li>Account holders and their team members.</li>
          <li>People who give a testimonial through a collect page (“givers”).</li>
          <li>People invited by email to give a testimonial.</li>
          <li>Authors of public reviews that a customer imports from another site.</li>
          <li>Visitors to {domain}, to collect pages and wall pages, and to websites that embed a widget.</li>
        </Ul>
      </Section>

      <Section title="3. What we collect and why">
        <P>Account holders</P>
        <Table
          head={["Data", "Why", "Legal basis"]}
          rows={[
            [
              "Email address, name, avatar (from GitHub or Google if you sign in that way)",
              "Your account, sign-in codes, notices about your account",
              "Contract",
            ],
            [
              "Sessions: a random token, when it was created, a hashed IP address, browser type",
              "Keeping you signed in, letting you sign out everywhere",
              "Contract",
            ],
            ["Spaces, forms, widgets, settings, team members' email addresses", "Running the product", "Contract"],
            [
              "Billing: Polar customer id, subscription status, trial dates",
              "Knowing what your account may do. Card details never reach us",
              "Contract",
            ],
            ["Emails we send you (address, subject, content) in a sending queue", "Reliable delivery", "Contract"],
            ["API keys (hashed), webhook endpoints, delivery logs", "Integrations you turn on", "Contract"],
            [
              "Activity log: which team member (or giver, or API key) exported, edited or deleted personal data in a space, and when. Ids only, no content",
              "Accountability for what happens to personal data; the space owner can see it",
              "Legal obligation",
            ],
            ["Support emails you send us", "Answering you", "Legitimate interest"],
          ]}
        />
        <P>Testimonial givers</P>
        <Table
          head={["Data", "Why", "Legal basis"]}
          rows={[
            [
              "Name, job title, company, email, website, the testimonial text, rating, answers to the business's questions, photo, video",
              "The testimonial the giver chose to leave; the email lets the business and us reach the giver about it and is never shown publicly",
              "Consent (the checkbox on the form)",
            ],
            [
              "Consent record: the exact wording shown, its version and language, when, and the page it was given on",
              "Proof of consent",
              "Legal obligation",
            ],
            [
              "A private link to the testimonial (only a hash of it is stored), sent in a receipt email when the giver leaves an address",
              "Letting the giver see, change or delete what they sent",
              "Consent",
            ],
            [
              LEGAL.inviteTracking
                ? "Invitation email: name, address, when it was sent, opened and clicked, unsubscribe"
                : "Invitation email: name, address, when it was sent and clicked, unsubscribe",
              "Sending the invitation the business asked for and not sending more when the person opts out",
              "Legitimate interest of the business; consent where local law requires it",
            ],
            ["Reward codes (if the business offers one), NPS score", "Delivering what the business promised", "Contract with the business"],
          ]}
        />
        <P>Authors of imported reviews</P>
        <Table
          head={["Data", "Why", "Legal basis"]}
          rows={[
            [
              "Public name, handle, avatar, review text, rating, date and the link to the original",
              "The customer republishes a review that is already public, with attribution",
              "Legitimate interest of the customer; the customer confirms it has the right to republish",
            ],
          ]}
        />
        <P>Visitors</P>
        <Table
          head={["Data", "Why", "Legal basis"]}
          rows={[
            [
              "A keyed hash of the IP address, kept with a counter for up to an hour",
              "Rate limits and abuse protection. The IP itself is not stored by us",
              "Legitimate interest",
            ],
            ["Request logs at our hosting provider (IP address, URL, time, browser)", "Security and debugging", "Legitimate interest"],
            [
              "Widget statistics: views, plays and clicks counted per widget, per day and per website hostname",
              "Showing customers how their widget performs. No cookies, no identifiers, no per-visitor record",
              "Legitimate interest",
            ],
            ["Collect-page view counts", "Showing customers how their form performs. No identifiers", "Legitimate interest"],
            [
              "Reports of a testimonial: the reason, what you wrote and, if you give it, your email",
              "Letting the business (and us) act on it and answer you",
              "Legitimate interest",
            ],
          ]}
        />
        <P>
          Where we rely on legitimate interest, the interest is running a secure, working service; we have weighed it against your rights
          and keep the data minimal and short-lived. Under India’s DPDP Act, the processing of account and giver data happens with your
          consent or for a purpose you asked for; the security data above is processed to protect the service, as the Act permits.
        </P>
      </Section>

      <Section title="4. What we do not do">
        <Ul>
          <li>
            We do not sell personal data, and we do not “share” it for cross-context behavioural advertising in the sense of California law.
          </li>
          <li>We do not run advertising, trackers or third-party analytics on {domain}, collect pages, wall pages or widgets.</li>
          <li>We do not make automated decisions with legal or similar effect about you.</li>
          <li>
            We do not use your content to train AI models. AI features (when on) send only the content a feature needs to the provider.
            Anthropic does not train its models on data sent through its API unless the customer opts in, and we have not; every request to
            Deepgram carries its opt-out from model improvement.
          </li>
          <li>We never show a giver’s email address on a public page, widget, API response or export that the public can reach.</li>
          <li>
            Read-only API keys and webhooks never carry a giver’s email address; only keys the customer creates with write access do. A
            customer’s own endpoint (a webhook, Zapier, Make) that receives data becomes the customer’s processor, not ours.
          </li>
        </Ul>
      </Section>

      <Section title="5. Who sees your data">
        <Ul>
          <li>
            The customer who collected it: a business sees the testimonials given to it, including the giver’s email and the answers to its
            questions. Only the space’s owner can export them or connect integrations; every team member’s exports, edits and deletions are
            logged.
          </li>
          <li>
            The public, when the customer publishes a testimonial: name, title, company, text, rating, photo, video and the date, on the
            customer’s pages, wall pages, widgets, social images and the read-only API.
          </li>
          <li>
            Subprocessors that store or move the data for us, listed with locations on the <A href="/legal/subprocessors">Subprocessors</A>{" "}
            page: hosting, database, file storage, email delivery and, when turned on, AI providers.
          </li>
          <li>
            Independent companies you choose to use: Polar for payments, GitHub or Google for sign-in, and any integration (webhooks, Slack,
            Zapier, Make) you connect. They handle data under their own policies.
          </li>
          <li>Authorities, when a law or a valid order requires it. We tell the affected customer unless the law forbids it.</li>
          <li>A successor, if the service is taken over by someone else, with notice to you and under this policy.</li>
        </Ul>
      </Section>

      <Section title="6. Where the data is">
        <P>
          The operator is in India. The infrastructure is run by the companies on the Subprocessors page, in the locations named there. Data
          therefore moves between countries. For people in the EU, UK and Switzerland, transfers to countries without an adequacy decision
          rest on the European Commission’s Standard Contractual Clauses (2021/914) and the UK Addendum, which are part of each
          subprocessor’s data processing terms with us. For people in India, transfers happen within the limits the Central Government sets
          under section 16 of the DPDP Act.
        </P>
      </Section>

      <Section title="7. How long we keep it">
        <Table
          head={["Data", "Kept for"]}
          rows={[
            [
              "Account, spaces and testimonials",
              "Until you delete them or your account. After an account deletion everything is removed at once; backups are overwritten within " +
                r.deletedAccountDays +
                " days",
            ],
            ["Sign-in sessions", `${r.sessionDays} days of inactivity, or until you sign out`],
            ["Sign-in codes", "10 minutes"],
            ["Rate-limit counters (hashed IP)", `${r.rateLimitHours} hour`],
            ["Uploads that were never attached to anything", `${r.unclaimedUploadHours} hours`],
            ["Sent emails in the sending queue", `${r.outboxSentDays} days once sent, ${r.outboxAnyDays} days at most`],
            ["Invitation opens and clicks", `${r.inviteTrackingDays} days`],
            ["Activity log (ids only)", `${r.auditLogDays} days`],
            ["Reports of a testimonial, once handled", `${r.resolvedReportDays} days`],
            ["A giver’s private link", `${r.giverLinkDays} days, or until the testimonial is deleted`],
            ["Copies of a deleted photo or video in browser and network caches", `Up to ${r.fileCacheHours} hours after the deletion`],
            ["Widget and form statistics (no personal data)", `${r.widgetStatsDays} days`],
            ["API and webhook delivery logs", `${r.apiLogDays} days`],
            ["Hosting provider request logs", `Up to ${r.serverLogDays} days`],
            ["Billing records at Polar", "As long as tax law requires Polar to keep them"],
            [
              "Unsubscribe list for invitations (a one-way hash of the address, not the address)",
              "Until the customer's account is deleted, so we keep honouring the opt-out",
            ],
            [
              "After an account is deleted on a service that charges: a SHA-256 hash of its email address and the date it first signed up (nothing else), so the same address doesn't get a second free trial",
              `${r.signupHistoryDays} days`,
            ],
          ]}
        />
      </Section>

      <Section title="8. Your rights and how to use them">
        <P>Wherever you are, you can:</P>
        <Ul>
          <li>see the personal data we hold about you and get a copy;</li>
          <li>correct it;</li>
          <li>delete it;</li>
          <li>withdraw consent, as easily as you gave it;</li>
          <li>object to or restrict processing based on legitimate interest;</li>
          <li>take your data with you in a machine-readable form;</li>
          <li>complain to a supervisory authority (section 10).</li>
        </Ul>
        <P>In the product:</P>
        <Ul>
          <li>
            Account holders: change your name in Account settings; export everything there (one JSON file with every space you own, its
            settings, team, testimonials with their consent records, API key names, and download links for your files that work for a day; a
            space’s testimonials also export as CSV), and delete the account there. Deletion removes spaces, testimonials, widgets, files,
            sessions, team memberships and mail still waiting to be sent for you, cancels the subscription, and is confirmed by email. To
            change your email address, write to us.
          </li>
          <li>
            Givers: if you leave your email on the form, the receipt email you get contains a private link to view, edit or delete your
            testimonial (it works for {r.giverLinkDays} days). Wall pages and widgets also have a “Report” link that lets anyone ask for a
            testimonial to be removed, without an account.
          </li>
          <li>
            Invited people: every invitation email has an unsubscribe link. One click stops all further invitations from that business.
          </li>
        </Ul>
        <P>
          For anything else, email <Mail address={contact.privacy} /> from the address we hold, or tell us how to verify it is you. We
          answer within 30 days (within 45 days for requests under California law, as that law allows). We never charge for this and never
          treat you differently for asking. You may use an authorised agent; we will ask them to prove you authorised them.
        </P>
        <P>
          If you gave a testimonial to a business, we may pass your request to that business, since it decides what it publishes; if it does
          not act within 7 days, we remove the testimonial ourselves.
        </P>
      </Section>

      <Section title="9. Country notes">
        <P>
          EU, EEA, UK and Switzerland (GDPR and UK GDPR). The legal bases are in section 3. You can complain to your local data protection
          authority; in the UK that is the ICO (ico.org.uk). We have no establishment in the EU or UK.
          {LEGAL.euRepresentative ? ` Our EU representative: ${LEGAL.euRepresentative}.` : ""}
          {LEGAL.ukRepresentative ? ` Our UK representative: ${LEGAL.ukRepresentative}.` : ""}
        </P>
        <P>
          California (CCPA/CPRA). The categories we collect are identifiers, commercial information (subscription), internet activity
          (hashed IP, logs, widget counts), and audio-visual data (photos, videos) for givers. We collect them from you directly, from your
          sign-in provider, or from the customer who invited you. We do not sell or share personal information and have not done so in the
          past 12 months. We do not use or disclose sensitive personal information to infer characteristics. You have the rights to know,
          delete, correct, and to not be discriminated against; use section 8. We honour Global Privacy Control signals as an opt-out,
          although there is nothing to opt out of.
        </P>
        <P>
          India (Digital Personal Data Protection Act 2023 and Rules 2025). We process your personal data with your consent for the purposes
          stated on the form or page where you gave it, and you may withdraw consent at any time as easily as you gave it, after which we
          stop and delete the data unless the law requires keeping it. You have the rights of access, correction, erasure, grievance
          redressal and to nominate someone to act for you. The person who answers questions about your personal data, and our grievance
          officer, is {operator} (contact: <Mail address={contact.privacy} />
          ); we respond within 30 days. If you are not satisfied you may approach the Data Protection Board of India. We tell affected
          people and the Board of a personal data breach as the Rules require. Before we delete data because it is no longer needed, we tell
          you at least 48 hours in advance where the Rules require it.
        </P>
        <P>Other countries. If the law where you live gives you other rights, write to us and we will honour them.</P>
      </Section>

      <Section title="10. Children">
        <P>
          The service is not for children. Nobody under {minimumAge} may hold an account. Customers must not invite children to give
          testimonials (under 18 in India, under 16 in the EU and UK, under 13 in the United States) and we delete a child’s testimonial as
          soon as we learn of it; tell us (contact: <Mail address={contact.privacy} />
          ).
        </P>
      </Section>

      <Section title="11. Security and breaches">
        <P>
          How we protect the service is on the <A href="/legal/security">Security</A> page. If a breach affects your personal data we tell
          you without undue delay, with what happened, what it means for you and what we are doing, and we notify the authorities the law
          requires (within 72 hours under the GDPR; as the DPDP Rules require in India).
        </P>
      </Section>

      <Section title="12. Cookies">
        <P>
          Only essential cookies, so no banner. Details on the <A href="/legal/cookies">Cookies</A> page.
        </P>
      </Section>

      <Section title="13. Changes">
        <P>
          When this policy changes we update the date at the top. For a change that affects how we use your data we email account holders at
          least {LEGAL.changeNoticeDays} days before it takes effect.
        </P>
      </Section>

      <Section title="14. Contact">
        <P>
          {operator}, operator of {product}. Privacy and data requests: <Mail address={contact.privacy} />. Everything else:{" "}
          <Mail address={contact.legal} />.
          {LEGAL.postalAddress ? ` Postal address: ${LEGAL.postalAddress}.` : " A postal address is available on request."}
        </P>
      </Section>
    </Doc>
  );
}
