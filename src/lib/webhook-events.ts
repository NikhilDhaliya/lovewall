// Webhook events and names, shared by the server and the settings UI.
export const EVENTS = ["testimonial.created", "testimonial.updated", "testimonial.approved", "testimonial.deleted"] as const;
export type WebhookEvent = (typeof EVENTS)[number];

export const EVENT_LABELS: Record<string, string> = {
  "testimonial.created": "New testimonial",
  "testimonial.updated": "Testimonial changed",
  "testimonial.approved": "Testimonial approved",
  "testimonial.deleted": "Testimonial deleted",
  "webhook.test": "Test",
};

export type HookKind = "webhook" | "rest" | "slack" | "discord";
export const CHAT_KINDS = ["slack", "discord"] as const;
export type ChatKind = (typeof CHAT_KINDS)[number];
