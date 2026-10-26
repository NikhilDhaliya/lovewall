// Lawyer review: a lawyer should review this page before launch. Operator values live in src/lib/legal/config.ts.
import type { Metadata } from "next";
import { A, Doc, Mail, Ol, P, Section, Table, Ul } from "@/components/legal/doc";
import { LEGAL } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Data Processing Agreement" };

export default function DpaPage() {
  const { product, operator, contact, retention: r } = LEGAL;
  return (
    <Doc
      title="Data Processing Agreement"
      lead={`For customers who are businesses. It sets out how ${operator} ("the Processor") processes personal data on behalf of the customer ("the Controller") when the customer uses the hosted ${product} service. It is part of the Terms of Service and needs no signature; a countersigned copy is available on request.`}
    >
      <Section title="1. Scope and roles">
        <P>
          This agreement covers the personal data the Controller puts into the service or collects through it: testimonial givers’ data,
          invitees, imported review authors and team members (“Customer Data”). For Customer Data the Controller is the controller (data
          fiduciary under India’s DPDP Act, business under the CCPA) and the Processor is the processor (data processor, service provider).
          It applies where the GDPR, the UK GDPR, the Swiss FADP, the DPDP Act, the CCPA/CPRA or a similar law applies to the Controller.
        </P>
        <P>
          For account holders’ own data and for security data, the Processor is itself a controller; that is covered by the{" "}
          <A href="/legal/privacy">Privacy Policy</A>, not by this agreement.
        </P>
      </Section>

      <Section title="2. Details of the processing">
        <Table
          head={["Item", "Description"]}
          rows={[
            [
              "Subject matter",
              "Collecting, storing, managing and publishing testimonials and reviews, and related emails and integrations",
            ],
            ["Duration", "The life of the Controller's account, plus the deletion periods in section 9"],
            [
              "Nature and purpose",
              "Hosting and displaying content the Controller collects; sending invitations and receipts on its behalf; providing exports, API and integrations the Controller turns on; optional AI processing of text the Controller selects",
            ],
            [
              "Categories of data subjects",
              "Testimonial givers; people the Controller invites; authors of public reviews the Controller imports; the Controller's team members",
            ],
            [
              "Categories of personal data",
              "Name, email, job title, company, website, photo, video (image and voice), free-text testimonial and answers, rating, date, consent record, invitation status, hashed IP for abuse protection, public profile data of imported authors",
            ],
            ["Special categories", "None intended. The Controller must not collect them through the service"],
            ["Frequency", "Continuous, as long as the account exists"],
          ]}
        />
      </Section>

      <Section title="3. The Processor's obligations (GDPR Art. 28(3))">
        <Ol>
          <li>
            Instructions. The Processor processes Customer Data only on the Controller’s documented instructions, which are: the Terms, this
            agreement, and the settings and actions the Controller takes in the product (publishing, inviting, exporting, connecting
            integrations). It will tell the Controller if it believes an instruction breaks the law. It may process data otherwise only
            where the law it is subject to requires it, and then tells the Controller first unless that law forbids it.
          </li>
          <li>
            Confidentiality. Everyone the Processor lets access Customer Data is bound by confidentiality. Today that is the operator alone.
          </li>
          <li>Security. The Processor applies the measures in Annex 2 and keeps them up to date.</li>
          <li>Subprocessors. See section 5.</li>
          <li>
            Data subject requests. The Processor helps the Controller answer requests from data subjects. The product provides self-service
            tools for the main ones (view, delete, unsubscribe, export). A request that reaches the Processor directly is passed to the
            Controller within 5 business days, unless the Processor must act itself under the Privacy Policy.
          </li>
          <li>
            Assistance. The Processor helps the Controller with security, breach notification, impact assessments and consultations with
            authorities, so far as the information it holds allows.
          </li>
          <li>
            Deletion. At the end of the service the Processor deletes Customer Data as in section 9, unless law requires it to keep some of
            it.
          </li>
          <li>
            Audit. The Processor makes available the information needed to show compliance: this agreement, the Security page, the source
            code (it is open source), the Subprocessors page and its subprocessors’ certifications. The Controller may audit once a year, at
            its own cost, on 30 days’ notice, in a way that does not disturb other customers; an audit by a regulator is always allowed.
          </li>
        </Ol>
      </Section>

      <Section title="4. The Controller's obligations">
        <Ul>
          <li>
            It has a lawful basis for the Customer Data it collects, and the consent wording on its forms (the product’s default wording, or
            its own) is adequate for its purposes.
          </li>
          <li>It has the right to republish the reviews it imports.</li>
          <li>It answers its data subjects’ requests and removes testimonials when asked.</li>
          <li>It does not put special categories of data, children’s data or data it has no right to use into the service.</li>
          <li>It keeps its sign-in and API credentials safe and reviews who is on its team.</li>
        </Ul>
      </Section>

      <Section title="5. Subprocessors">
        <P>
          The Controller gives general authorisation for the subprocessors on the <A href="/legal/subprocessors">Subprocessors</A> page. The
          Processor has a written contract with each one imposing data protection obligations no weaker than these, and stays responsible
          for them. Before adding or replacing a subprocessor, the Processor emails account holders at least 30 days in advance (or updates
          the page and emails those who subscribed to changes there). The Controller may object on reasonable data protection grounds within
          those 30 days; if the Processor cannot address the objection, the Controller may end the service and receives a refund of any
          prepaid, unused period.
        </P>
      </Section>

      <Section title="6. International transfers">
        <P>
          The Processor is in India and its subprocessors are in the countries listed on the Subprocessors page. For transfers of Customer
          Data from the EEA to the Processor or to a country without an adequacy decision, the parties agree to the Standard Contractual
          Clauses adopted by Commission Implementing Decision (EU) 2021/914, Module Two (controller to processor), which are incorporated by
          reference, with these choices: Clause 7 (docking) included; Clause 9(a) Option 2 (general authorisation, 30 days); Clause 11
          optional language not included; Clause 13 and Annex I.C: the supervisory authority of the Controller’s member state; Clause 17:
          the law of Ireland; Clause 18: the courts of Ireland. Annex I is section 2 of this agreement with the parties’ details from the
          account; Annex II is Annex 2 below; Annex III is the Subprocessors page.
        </P>
        <P>
          For transfers from the UK, the UK International Data Transfer Addendum (version B1.0) to the EU SCCs applies, with the tables
          filled from this agreement and either party able to end it under its section 19. For Switzerland, the SCCs apply with the Swiss
          adaptations recommended by the FDPIC.
        </P>
        <P>
          For data subject to the DPDP Act, transfers outside India are made in line with any restrictions the Central Government notifies
          under section 16 of that Act.
        </P>
      </Section>

      <Section title="7. Personal data breaches">
        <P>
          The Processor tells the Controller without undue delay, and in any case within 48 hours of becoming aware, of a personal data
          breach affecting Customer Data, with what it knows: the nature of the breach, the data and people affected as far as known, the
          likely consequences, and the measures taken. It updates the Controller as it learns more, so the Controller can meet its own
          deadlines (72 hours under the GDPR; as the DPDP Rules require in India).
        </P>
      </Section>

      <Section title="8. CCPA/CPRA service provider terms">
        <P>
          Where the CCPA applies, the Processor is a service provider. It does not sell or share Customer Data, does not retain, use or
          disclose it for any purpose other than providing the service, does not combine it with personal data from other sources except as
          the CCPA allows, and tells the Controller if it can no longer meet its obligations. The Controller may take reasonable steps to
          stop and remedy unauthorised use.
        </P>
      </Section>

      <Section title="9. Deletion and return">
        <P>
          The Controller can export all Customer Data at any time from the product (one JSON file per account with download links for files;
          testimonials also as CSV). Only a space’s owner can export it, and every export, edit and deletion by a team member is recorded in
          an activity log the owner can see (ids only, kept {r.auditLogDays} days). When the Controller deletes its account, Customer Data
          is deleted at once from the live systems and from storage, and disappears from backups within {r.deletedAccountDays} days. Email
          delivery logs are kept for at most {r.outboxAnyDays} days and contain only address, subject and content. Data a subprocessor must
          keep by law (billing records at Polar) is outside this agreement.
        </P>
      </Section>

      <Section title="10. Liability and term">
        <P>
          The limitation of liability in the Terms applies to this agreement as a whole, except where the law applicable to the data
          subjects does not allow it. This agreement lasts as long as the Processor processes Customer Data. If it conflicts with the Terms,
          this agreement wins for personal data; the SCCs win over everything.
        </P>
      </Section>

      <Section title="Annex 2: technical and organisational measures">
        <Ul>
          <li>Encryption in transit everywhere (TLS); encryption at rest at the database and storage providers.</li>
          <li>
            Private file storage: files are served only through short-lived signed URLs and only once a testimonial or space claims them.
          </li>
          <li>
            Access control per space and per team member; sessions stored server-side and revocable; sign-in by one-time code or OAuth, no
            passwords stored.
          </li>
          <li>Secrets (API keys, webhook secrets) stored hashed or encrypted; never shown again after creation.</li>
          <li>IP addresses hashed with a server secret before use for rate limits and sessions; never stored raw by the service.</li>
          <li>
            Sign-in tokens from GitHub or Google are dropped after sign-in; giver links and invite tokens are random, stored hashed and
            expire.
          </li>
          <li>Read-only API keys and webhooks never carry givers’ email addresses.</li>
          <li>
            Content Security Policy, output escaping of all user content, SSRF-safe outbound fetches, rate limits on every public endpoint.
          </li>
          <li>
            Infrastructure operated by providers with SOC 2 and ISO 27001 programmes (see the Subprocessors page); the service itself is a
            single-operator business and does not hold its own certification.
          </li>
          <li>
            Open-source code, so anyone can audit it; a responsible disclosure process at <Mail address={contact.security} />.
          </li>
          <li>Backups by the database provider; deletion propagates within the periods on this page.</li>
          <li>Minimal data: no analytics trackers, no advertising, no cookies beyond the session.</li>
        </Ul>
      </Section>

      <Section title="Contact">
        <P>
          For a countersigned copy, a subprocessor-change subscription or questions: <Mail address={contact.legal} />.
        </P>
      </Section>
    </Doc>
  );
}
