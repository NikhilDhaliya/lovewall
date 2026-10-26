import { apiUrl } from "./lib.js";

// The address of the Lovewall instance (hosted or self-hosted) and an API key from it (Settings, API keys).
const authentication = {
  type: "custom",
  fields: [
    {
      key: "app_url",
      label: "Lovewall URL",
      type: "string",
      required: true,
      placeholder: "https://testimonials.example.com",
      helpText: "The address of your Lovewall: the hosted service you signed up to, or your own server.",
    },
    {
      key: "api_key",
      label: "API key",
      type: "password",
      required: true,
      helpText: "In Lovewall, open your space's settings and create an API key. Creating and approving need write access.",
    },
  ],
  test: async (z, bundle) => {
    const response = await z.request({ url: apiUrl(bundle, "/space") });
    return response.data.data;
  },
  // bundle.inputData is what test returned: the space.
  connectionLabel: (z, bundle) => bundle.inputData.name,
};

export default authentication;
