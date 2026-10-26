import { apiUrl } from "../lib.js";
import { OUTPUT_FIELDS, TESTIMONIAL } from "../samples.js";

// Approves a testimonial, so it shows on your walls.
const approveTestimonial = {
  key: "approve_testimonial",
  noun: "Testimonial",
  display: {
    label: "Approve Testimonial",
    description: "Approves a testimonial so it shows on your walls.",
  },
  operation: {
    inputFields: [
      {
        key: "id",
        label: "Testimonial",
        required: true,
        dynamic: "testimonial_list.id.label",
        helpText: "Pick one from the inbox, or map an ID from an earlier step.",
      },
    ],
    perform: async (z, bundle) => {
      const id = encodeURIComponent(String(bundle.inputData.id).trim());
      const response = await z.request({ url: apiUrl(bundle, `/testimonials/${id}/approve`), method: "POST" });
      return response.data.data;
    },
    sample: TESTIMONIAL,
    outputFields: OUTPUT_FIELDS,
  },
};

export default approveTestimonial;
