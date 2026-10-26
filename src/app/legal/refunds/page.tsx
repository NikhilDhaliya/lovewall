import type { Metadata } from "next";
import { Doc, Mail, OwnerNote, P, Section, Ul } from "@/components/legal/doc";
import { LEGAL } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Refunds and cancellation" };

export default function RefundsPage() {
  const { contact, plan, refundDays } = LEGAL;
  return (
    <Doc
      title="Refunds and cancellation"
      lead="Cancel whenever you like. If the service was not for you, ask for your money back in the first days."
    >
      <Section title="Trial">
        <P>
          Every new account starts with {plan.trialDays} free days. No card is taken, so nothing is charged when the trial ends: your
          dashboard simply asks you to subscribe, and your published pages and widgets keep working while you decide.
        </P>
      </Section>

      <Section title="Cancelling">
        <Ul>
          <li>Cancel any time from Account settings or from the Polar customer portal linked there.</li>
          <li>Your subscription stays active until the end of the period you paid for, then does not renew.</li>
          <li>Deleting your account cancels the subscription too.</li>
        </Ul>
      </Section>

      <Section title="Refunds">
        <Ul>
          <li>
            Within {refundDays} days of your first charge, ask and we refund it in full, no questions asked. Email{" "}
            <Mail address={contact.support} /> from your account address.
          </li>
          <li>
            After that, charges for a period already started are not refunded, except where we end the service or where the law where you
            live requires a refund.
          </li>
          <li>If we end the service or your account for reasons other than a breach, we refund the unused part of any prepaid period.</li>
          <li>Refunds go to the original payment method and are issued by Polar, usually within 5 to 10 business days.</li>
        </Ul>
      </Section>

      <Section title="Who handles payments">
        <P>
          Polar Software Inc. is the merchant of record: it charges you, issues invoices and refunds, and handles sales tax or VAT. Your
          invoices are in the Polar customer portal.
        </P>
      </Section>

      <OwnerNote>
        Owner’s decision: the refund window ({refundDays} days) and the “no questions asked” wording are drafts. Change refundDays in
        config.ts.
      </OwnerNote>
    </Doc>
  );
}
