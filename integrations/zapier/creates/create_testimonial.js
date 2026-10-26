import { apiUrl, compact } from "../lib.js";
import { OUTPUT_FIELDS, TESTIMONIAL } from "../samples.js";

// Adds a testimonial from anywhere: a form tool, a CRM note, a support reply.
const createTestimonial = {
  key: "create_testimonial",
  noun: "Testimonial",
  display: {
    label: "Create Testimonial",
    description: "Adds a testimonial to your space.",
    important: true,
  },
  operation: {
    inputFields: [
      { key: "name", label: "Name", required: true, helpText: "Who said it (up to 80 characters)." },
      { key: "text", label: "Text", type: "text", required: true, helpText: "What they said (up to 3,000 characters)." },
      { key: "rating", label: "Rating", type: "integer", helpText: "1 to 5 stars." },
      { key: "title", label: "Title", helpText: "Role, like Head of Growth." },
      { key: "company", label: "Company" },
      { key: "handle", label: "Handle", helpText: "Social handle, without the @." },
      { key: "email", label: "Email", helpText: "Kept private, never shown on walls." },
      { key: "source", label: "Source", default: "Zapier", helpText: "Where it came from, like Typeform or Intercom." },
      { key: "source_url", label: "Source URL", helpText: "An https link to the original. A link already in your space is skipped." },
      { key: "avatar_url", label: "Avatar URL", helpText: "An https image link; Lovewall keeps its own copy." },
      { key: "given_at", label: "Date", type: "datetime", helpText: "When it was given. Defaults to now." },
      { key: "tags", label: "Tags", list: true },
      {
        key: "status",
        label: "Status",
        default: "new",
        choices: [
          { value: "new", label: "New (inbox)", sample: "new" },
          { value: "approved", label: "Approved (on walls)", sample: "approved" },
          { value: "hidden", label: "Hidden", sample: "hidden" },
        ],
      },
    ],
    perform: async (z, bundle) => {
      const d = bundle.inputData;
      const body = compact({
        name: d.name,
        text: d.text,
        rating: d.rating === undefined || d.rating === "" ? undefined : Number(d.rating),
        title: d.title,
        company: d.company,
        handle: d.handle ? String(d.handle).replace(/^@+/, "") : undefined,
        email: d.email,
        source: d.source,
        source_url: d.source_url,
        avatar_url: d.avatar_url,
        given_at: d.given_at,
        tags: d.tags,
        status: d.status,
      });
      const response = await z.request({ url: apiUrl(bundle, "/testimonials"), method: "POST", body });
      return response.data.data;
    },
    sample: TESTIMONIAL,
    outputFields: OUTPUT_FIELDS,
  },
};

export default createTestimonial;
