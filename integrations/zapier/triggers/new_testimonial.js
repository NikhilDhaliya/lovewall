import { apiUrl, hookPayload, subscribeHook, unsubscribeHook } from "../lib.js";
import { OUTPUT_FIELDS, TESTIMONIAL } from "../samples.js";

// Instant: Lovewall calls Zapier as soon as a testimonial arrives (form, import, API, extension).
const newTestimonial = {
  key: "new_testimonial",
  noun: "Testimonial",
  display: {
    label: "New Testimonial",
    description: "Triggers when a new testimonial is added to your space.",
    important: true,
  },
  operation: {
    type: "hook",
    performSubscribe: subscribeHook("testimonial.created"),
    performUnsubscribe: unsubscribeHook,
    perform: hookPayload,
    // Real recent testimonials for the Zap editor's samples.
    performList: async (z, bundle) => {
      const response = await z.request({ url: apiUrl(bundle, "/testimonials"), params: { status: "all", limit: 3 } });
      return response.data.data;
    },
    sample: TESTIMONIAL,
    outputFields: OUTPUT_FIELDS,
  },
};

export default newTestimonial;
