import type { Metadata } from "next";
import { A, Doc, Mail, P, Section, Table } from "@/components/legal/doc";
import { LEGAL } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Subprocessors" };

export default function SubprocessorsPage() {
  const { contact, subprocessors, independentParties } = LEGAL;
  return (
    <Doc
      title="Subprocessors"
      lead="The companies that store or move personal data for the hosted service, what they handle and where. We tell account holders 30 days before this list changes."
    >
      <Section title="Subprocessors">
        <Table
          head={["Company", "Purpose", "Data", "Location"]}
          rows={subprocessors.map((s) => [
            <A key={s.name} href={s.site}>
              {s.name}
            </A>,
            s.purpose,
            s.data,
            s.location,
          ])}
        />
        <P>
          Anthropic and Deepgram receive data only from spaces where AI is switched on (Space settings, AI), and only the text, images or
          audio each feature needs.
        </P>
      </Section>

      <Section title="Independent companies you may use">
        <P>These act for themselves, under their own privacy policies, when you choose to use them. They are not our processors.</P>
        <Table
          head={["Company", "Role"]}
          rows={independentParties.map((p) => [
            <A key={p.name} href={p.site}>
              {p.name}
            </A>,
            p.role,
          ])}
        />
        <P>
          Integrations you connect yourself (webhooks, Slack, Discord, Zapier, Make, the API) send data to endpoints you choose. They are
          your processors, not ours.
        </P>
      </Section>

      <Section title="Changes">
        <P>
          To be emailed before a change to this list, write to <Mail address={contact.legal} /> with “subprocessor updates” in the subject.
        </P>
      </Section>
    </Doc>
  );
}
