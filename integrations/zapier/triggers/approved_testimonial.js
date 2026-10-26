import { apiUrl, hookPayload, subscribeHook, unsubscribeHook } from "../lib.js";
import { OUTPUT_FIELDS, TESTIMONIAL } from "../samples.js";

// Instant: a testimonial was approved, so it now shows on your walls.
const approvedTestimonial = {
  key: "approved_testimonial",
  noun: "Testimonial",
  display: {
    label: "Testimonial Approved",
    description: "Triggers when a testimonial is approved.",
  },
  operation: {
    type: "hook",
    performSubscribe: subscribeHook("testimonial.approved"),
    performUnsubscribe: unsubscribeHook,
    perform: hookPayload,
    performList: async (z, bundle) => {
      const response = await z.request({ url: apiUrl(bundle, "/testimonials"), params: { status: "approved", limit: 3 } });
      return response.data.data;
    },
    sample: TESTIMONIAL,
    outputFields: OUTPUT_FIELDS,
  },
};

export default approvedTestimonial;
