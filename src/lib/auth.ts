import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { pool } from "@/lib/db";
import { codeMail, sendMail } from "@/lib/mail";
import { ACCOUNT_LINKING, signUpAllowed, withHashedIp, withoutTokens } from "@/lib/auth-privacy";
import { CLIENT_IP_HEADER } from "@/lib/client-ip";
import { hashIp } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";

const production = process.env.NODE_ENV === "production";
const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const secure = appUrl.startsWith("https://");

const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET };
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
}

// Sign in with a 6-digit code by email (anyone can sign up), or GitHub/Google when configured.
// Sessions live in Postgres (revocable) behind an httpOnly, SameSite cookie; rate limits live there too. No raw IPs are
// stored (sessions and limits keep a keyed hash) and no OAuth tokens (they are only needed to sign in).
export const auth = betterAuth({
  appName: "Lovewall",
  baseURL: appUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [appUrl],
  database: pool(),
  user: { modelName: "auth_users" },
  session: {
    modelName: "auth_sessions",
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  account: {
    modelName: "auth_accounts",
    accountLinking: ACCOUNT_LINKING,
  },
  verification: { modelName: "auth_verifications" },
  emailAndPassword: { enabled: false },
  socialProviders,
  rateLimit: {
    enabled: true,
    // Better Auth keys its limits by "<ip><path>": counted in the app's own table under a keyed hash of that key.
    customStorage: {
      async consume(key, rule) {
        const limit = await rateLimit(`auth:${hashIp(key)}`, rule.max, rule.window);
        if (limit.ok) return { allowed: true, retryAfter: null };
        return { allowed: false, retryAfter: Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000)) };
      },
    },
    window: 60,
    max: 100,
    customRules: {
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/sign-in/email-otp": { window: 60, max: 6 },
    },
  },
  databaseHooks: {
    user: {
      create: { before: async (user) => (signUpAllowed(user) ? undefined : false) },
    },
    session: {
      create: { before: async (session) => ({ data: withHashedIp(session, hashIp) }) },
      update: { before: async (session) => ("ipAddress" in session ? { data: withHashedIp(session, hashIp) } : undefined) },
    },
    account: {
      create: { before: async (account) => ({ data: withoutTokens(account) }) },
      update: { before: async (account) => ({ data: withoutTokens(account) }) },
    },
  },
  advanced: {
    cookiePrefix: "lovewall",
    useSecureCookies: secure,
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure },
    database: { generateId: () => crypto.randomUUID() },
    // One header, filled by Lovewall from the trusted source and never by the client (src/lib/ip.ts withClientIp), so
    // Better Auth's limits count the same address as the app's.
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: "hashed",
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") return;
        // Per-address cap on top of the per-IP limit, so nobody can flood someone's inbox from many IPs.
        const limit = await rateLimit(`otp-mail:${email.toLowerCase()}`, 6, 3600);
        if (!limit.ok) return;
        await sendMail(codeMail(email, otp));
      },
    }),
    nextCookies(),
  ],
  telemetry: { enabled: false },
});

export const isProduction = production;
