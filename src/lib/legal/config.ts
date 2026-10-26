// Everything the legal pages say about the operator, in one place. Change these values, never the pages.
// Self-hosters: you are the operator of your own instance. Put your own name and addresses here (or keep the pages
// off: they only show on the hosted service or with LEGAL_PAGES=true).

export const LEGAL = {
  // The person or company that runs this instance. The hosted service names only this; no personal address.
  operator: "Nikhil Dhaliya",
  product: "Lovewall",
  domain: "lovewall.tech",
  // Role addresses on the product domain. Each one is a real mailbox the operator reads.
  contact: {
    privacy: "privacy@lovewall.tech",
    legal: "legal@lovewall.tech",
    security: "security@lovewall.tech",
    support: "support@lovewall.tech",
  },
  // Owner fills in: the city whose courts hear disputes. Empty = "the courts of India".
  jurisdiction: { country: "India", city: "" },
  // Owner fills in: a postal address. CAN-SPAM wants one in every commercial email sent to US addresses (a PO box
  // or a registered private mailbox qualifies). Empty = the footer omits it and the pages say "on request".
  postalAddress: "",
  // The day the current version of the Terms and Privacy Policy took effect (YYYY-MM-DD). Empty = draft.
  effectiveDate: "",
  // Days of notice before a change to the Terms that makes things worse for customers applies.
  changeNoticeDays: 30,
  // Pricing, as the Terms and the refund policy describe it.
  plan: { monthlyUsd: 9, yearlyUsd: 90, trialDays: 14 },
  // Owner decision (draft): an EU/UK representative under GDPR Art. 27 / UK GDPR. Empty = none appointed yet.
  euRepresentative: "",
  ukRepresentative: "",
  // Owner decision (draft: on): invitation emails carry an open pixel and record link clicks, so reminders go only
  // to people who did not open. Off = no pixel; clicks are still seen when someone opens the form.
  inviteTracking: true,
  // Owner decision: refund on request within this many days of the first charge.
  refundDays: 14,
  // Liability cap: fees paid in the prior 12 months or this amount, whichever is greater.
  liabilityFloorUsd: 50,
  // Nobody under this age may hold an account.
  minimumAge: 16,
  // Retention periods the policies promise (days). The product's cleanup jobs must match (see the data inventory).
  retention: {
    // Backups after an account deletion. Must stay at or above backupDays (a unit test checks).
    deletedAccountDays: 30,
    // Owner confirms the plan: Supabase Pro keeps daily backups for 7 days (PITR, if bought, up to 28). Keep this true.
    backupDays: 7,
    sessionDays: 30,
    outboxSentDays: 7,
    outboxAnyDays: 30,
    rateLimitHours: 1,
    unclaimedUploadHours: 24,
    inviteTrackingDays: 90,
    widgetStatsDays: 400,
    apiLogDays: 30,
    webhookLogDays: 30,
    serverLogDays: 30,
    auditLogDays: 365, // who did what with personal data (DPDP Rules ask for a year of logs)
    resolvedReportDays: 90,
    giverLinkDays: 365, // the private link in a giver's receipt email
    fileCacheHours: 2, // how long browsers and CDNs may keep a photo or video after it is deleted (1 h file + 30 min link)
  },
  // Where the data sits. Regions are the operator's choice at setup; keep them true.
  subprocessors: [
    {
      name: "Vercel Inc.",
      purpose: "Hosting, serverless functions, request logs",
      data: "All data in transit; request logs with IP addresses",
      location: "United States (functions in the region the operator picked)",
      site: "https://vercel.com/legal/privacy-policy",
    },
    {
      name: "Supabase Inc.",
      purpose: "Postgres database",
      data: "Everything the service stores, except files",
      location: "Region the operator picked at setup",
      site: "https://supabase.com/privacy",
    },
    {
      name: "Supabase Storage or Cloudflare R2",
      purpose: "File storage (photos, logos, videos)",
      data: "Uploaded files, in a private bucket",
      location: "Region the operator picked at setup",
      site: "https://www.cloudflare.com/privacypolicy/",
    },
    {
      name: "Zoho Corporation (ZeptoMail)",
      purpose: "Sending email",
      data: "Recipient address, subject, message content",
      location: "Zoho data centre matching the operator's ZeptoMail region",
      site: "https://www.zoho.com/privacy.html",
    },
    {
      name: "Anthropic PBC",
      purpose:
        "AI features (spam filter, sentiment, best line, spelling help, translation, summaries, case studies, reading screenshots and websites), when switched on in a space",
      data: "Testimonial text, answers and images, visitors' draft text when they ask for spelling help, pages of a website the user names; no account data",
      location: "United States",
      site: "https://www.anthropic.com/privacy",
    },
    {
      name: "Deepgram, Inc.",
      purpose: "Transcripts and captions of video testimonials, when switched on in a space",
      data: "Audio of video testimonials",
      location: "United States",
      site: "https://deepgram.com/privacy",
    },
  ],
  // Parties that act on their own behalf, not as processors for the operator.
  independentParties: [
    { name: "Polar Software Inc.", role: "Merchant of record: payments, invoices, tax", site: "https://polar.sh/legal/privacy" },
    { name: "GitHub, Inc.", role: "Sign in with GitHub (optional)", site: "https://docs.github.com/site-policy/privacy-policies" },
    { name: "Google LLC", role: "Sign in with Google (optional)", site: "https://policies.google.com/privacy" },
  ],
} as const;

export type LegalEnv = { APP_URL?: string; LEGAL_PAGES?: string };

// The pages show on the hosted service (APP_URL on the product domain) or when the operator turns them on.
export function legalEnabledFor(env: LegalEnv): boolean {
  if (/^(1|true|yes)$/i.test(env.LEGAL_PAGES ?? "")) return true;
  if (/^(0|false|no)$/i.test(env.LEGAL_PAGES ?? "")) return false;
  try {
    const host = new URL(env.APP_URL ?? "").hostname;
    return host === LEGAL.domain || host.endsWith(`.${LEGAL.domain}`);
  } catch {
    return false;
  }
}

export function legalEnabled(): boolean {
  return legalEnabledFor(process.env as LegalEnv);
}

// The postal address in the footer of invite emails (CAN-SPAM): the space's own, else the operator's on the hosted
// service. Owner decision pending: LEGAL.postalAddress is empty until it is made.
export function footerAddress(spaceAddress: string | null | undefined): string | null {
  return spaceAddress?.trim() || (legalEnabled() && LEGAL.postalAddress) || null;
}

export const courtsText = () =>
  LEGAL.jurisdiction.city
    ? `the courts of ${LEGAL.jurisdiction.city}, ${LEGAL.jurisdiction.country}`
    : `the courts of ${LEGAL.jurisdiction.country}`;

export const LEGAL_PAGES = [
  { slug: "terms", title: "Terms of Service" },
  { slug: "privacy", title: "Privacy Policy" },
  { slug: "cookies", title: "Cookies" },
  { slug: "acceptable-use", title: "Acceptable Use" },
  { slug: "refunds", title: "Refunds and cancellation" },
  { slug: "dpa", title: "Data Processing Agreement" },
  { slug: "subprocessors", title: "Subprocessors" },
  { slug: "security", title: "Security" },
] as const;
