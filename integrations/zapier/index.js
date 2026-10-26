import packageJson from "./package.json" with { type: "json" };
import zapier from "zapier-platform-core";
import authentication from "./authentication.js";
import approveTestimonial from "./creates/approve_testimonial.js";
import createTestimonial from "./creates/create_testimonial.js";
import { addBearer, handleErrors } from "./lib.js";
import approvedTestimonial from "./triggers/approved_testimonial.js";
import newTestimonial from "./triggers/new_testimonial.js";
import testimonialList from "./triggers/testimonial_list.js";

// Lovewall on Zapier. Everything goes through the REST API (<app url>/api/v1) with the connection's API key.
const app = {
  version: packageJson.version,
  platformVersion: zapier.version,
  authentication,
  beforeRequest: [addBearer],
  afterResponse: [handleErrors],
  triggers: {
    [newTestimonial.key]: newTestimonial,
    [approvedTestimonial.key]: approvedTestimonial,
    [testimonialList.key]: testimonialList,
  },
  searches: {},
  creates: {
    [createTestimonial.key]: createTestimonial,
    [approveTestimonial.key]: approveTestimonial,
  },
  resources: {},
};

export default app;
