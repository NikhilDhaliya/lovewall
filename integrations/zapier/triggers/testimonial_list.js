import { apiUrl } from "../lib.js";
import { TESTIMONIAL } from "../samples.js";

// Hidden: feeds the "Testimonial" dropdown of Approve Testimonial with the inbox (status new), newest first.
const testimonialList = {
  key: "testimonial_list",
  noun: "Testimonial",
  display: {
    label: "List Testimonials",
    description: "Lists testimonials waiting in the inbox, for dropdowns.",
    hidden: true,
  },
  operation: {
    canPaginate: true,
    perform: async (z, bundle) => {
      const params = { status: "new", limit: 100 };
      if (bundle.meta?.page && bundle.meta?.cursor) params.cursor = bundle.meta.cursor;
      const response = await z.request({ url: apiUrl(bundle, "/testimonials"), params });
      const { data, next_cursor: next } = response.data;
      await z.cursor.set(next || "");
      return data.map((t) => ({ ...t, label: `${t.name}: ${String(t.text).slice(0, 60)}` }));
    },
    sample: { ...TESTIMONIAL, label: `${TESTIMONIAL.name}: ${TESTIMONIAL.text.slice(0, 60)}` },
    outputFields: [
      { key: "id", label: "ID" },
      { key: "label", label: "Label" },
    ],
  },
};

export default testimonialList;
