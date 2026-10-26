import "server-only";

// Server env, read lazily so a missing value fails the request that needs it, not the build.
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function num(name: string, fallback: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const env = {
  get appUrl() {
    return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  },
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get authSecret() {
    return required("BETTER_AUTH_SECRET");
  },
  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
  },
  // Limits for the hosted service; self-hosters can raise them.
  get maxSpacesPerUser() {
    return num("MAX_SPACES_PER_USER", 10);
  },
  get maxWidgetsPerSpace() {
    return num("MAX_WIDGETS_PER_SPACE", 30);
  },
  get maxTestimonialsPerDay() {
    return num("MAX_SUBMISSIONS_PER_SPACE_PER_DAY", 300);
  },
  get maxVideoMb() {
    return num("MAX_VIDEO_MB", 60);
  },
  // Webhooks may reach private addresses and plain http (endpoints on the operator's own network; tests).
  get webhooksAllowPrivate() {
    return process.env.WEBHOOKS_ALLOW_PRIVATE === "1" || process.env.WEBHOOKS_ALLOW_PRIVATE === "true";
  },
  get maxMembersPerSpace() {
    return num("MAX_MEMBERS_PER_SPACE", 25);
  },
  // Hosted billing (Polar) is on only when POLAR_ACCESS_TOKEN is set: a self-hosted install has no plans, no trial
  // and nothing locked.
  get billing() {
    return Boolean(process.env.POLAR_ACCESS_TOKEN);
  },
  get maxInvitesPerDay() {
    return num("MAX_INVITES_PER_SPACE_PER_DAY", 200);
  },
  // Custom domains: the host customers point their CNAME at (default: this app's own host).
  get customDomainTarget() {
    return (process.env.CUSTOM_DOMAIN_TARGET || new URL(this.appUrl).hostname).trim().toLowerCase().replace(/\.$/, "");
  },
};

export const polarEnv = {
  get accessToken() {
    return process.env.POLAR_ACCESS_TOKEN ?? "";
  },
  get webhookSecret() {
    return process.env.POLAR_WEBHOOK_SECRET ?? "";
  },
  get server(): "sandbox" | "production" {
    return process.env.POLAR_SERVER === "sandbox" ? "sandbox" : "production";
  },
  get products() {
    return { monthly: process.env.POLAR_PRODUCT_MONTHLY ?? "", yearly: process.env.POLAR_PRODUCT_YEARLY ?? "" };
  },
  // Testing only: the end-to-end tests point the client at a mock API.
  get apiUrl() {
    return process.env.POLAR_API_URL || undefined;
  },
};

// Optional keys for imports. A source whose key is missing is hidden. Server only: never sent to browsers.
export const importKeys = {
  get google() {
    return process.env.GOOGLE_PLACES_API_KEY?.trim() || "";
  },
  get yelp() {
    return process.env.YELP_API_KEY?.trim() || "";
  },
  get youtube() {
    return process.env.YOUTUBE_API_KEY?.trim() || "";
  },
};

// AI: Claude for text and images, Deepgram for video transcripts. Each feature hides when its key is missing. Hosted
// uses our keys; self-hosters bring their own. Server only: never sent to browsers.
export const aiEnv = {
  get anthropicKey() {
    return process.env.ANTHROPIC_API_KEY?.trim() || "";
  },
  // Testing only: the end-to-end tests point the SDK at a mock API.
  get anthropicBaseUrl() {
    return process.env.ANTHROPIC_BASE_URL?.trim() || undefined;
  },
  // A small fast model for classification and short rewrites, a stronger one for writing.
  get fastModel() {
    return process.env.AI_MODEL_FAST?.trim() || "claude-haiku-5-5";
  },
  get writeModel() {
    return process.env.AI_MODEL_WRITE?.trim() || "claude-opus-5-5";
  },
  get deepgramKey() {
    return process.env.DEEPGRAM_API_KEY?.trim() || "";
  },
  // Testing only: a mock speech-to-text API.
  get deepgramUrl() {
    return (process.env.DEEPGRAM_API_URL?.trim() || "https://api.deepgram.com").replace(/\/$/, "");
  },
  // All AI calls a space can make per day (each feature also has its own cap).
  get maxCallsPerDay() {
    return num("AI_MAX_CALLS_PER_SPACE_PER_DAY", 1000);
  },
};

export const oauth = {
  github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
};
