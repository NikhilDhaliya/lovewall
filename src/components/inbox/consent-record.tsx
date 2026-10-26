const WHEN = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

type Consent = {
  consent?: boolean;
  consent_text?: string | null;
  consent_version?: string | null;
  consent_lang?: string | null;
  consent_at?: string | Date | null;
  consent_url?: string | null;
};

// What a giver agreed to on the form: the wording they saw, when, in which language, on which page.
export function ConsentRecord({ t }: { t: Consent }) {
  if (!t.consent_text || !t.consent_at) return null;
  const meta = [`${WHEN.format(new Date(t.consent_at))} UTC`, t.consent_lang?.toUpperCase(), t.consent_version && `v${t.consent_version}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="border-t border-line pt-4 text-[13px] leading-relaxed" data-testid="consent-record">
      <div className="font-medium text-muted">Consent</div>
      <p className="mt-1">“{t.consent_text}”</p>
      <p className="mt-1 text-muted">{meta}</p>
      {t.consent_url && <p className="truncate text-muted">{t.consent_url}</p>}
    </div>
  );
}
