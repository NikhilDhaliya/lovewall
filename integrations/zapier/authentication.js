import { DEFAULT_APP_URL, apiUrl } from "./lib.js";

// An API key from Lovewall (Settings, API keys) and the Lovewall address, for self-hosters.
const authentication = {
  type: "custom",
  fields: [
    {
      key: "app_url",
      label: "Lovewall URL",
      type: "string",
      required: true,
      default: DEFAULT_APP_URL,
      helpText: "Keep https://lovewall.tech unless you host Lovewall yourself.",
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
