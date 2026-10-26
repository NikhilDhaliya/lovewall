// What Better Auth may keep about sign-ins (plain module: the unit tests import it).

const TOKEN_FIELDS = ["accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt"] as const;

// GitHub and Google tokens are only needed during sign-in: nothing calls those APIs later, so they are never stored.
export function withoutTokens<T extends Record<string, unknown>>(account: T): T {
  const out: Record<string, unknown> = { ...account };
  for (const field of TOKEN_FIELDS) if (field in out) out[field] = null;
  return out as T;
}

// Sessions keep a keyed hash of the IP (enough to tell sessions apart), never the address itself.
export function withHashedIp<T extends { ipAddress?: string | null }>(session: T, hash: (ip: string) => string): T {
  const ip = session.ipAddress?.trim();
  return { ...session, ipAddress: ip ? hash(ip) : null };
}

// New accounts start only from an address someone has proven: the email code proves it, and GitHub or Google must
// report it verified. Otherwise an account made with someone else's unverified address would be waiting for them.
export function signUpAllowed(user: { emailVerified?: boolean | null }): boolean {
  return user.emailVerified === true;
}

// A GitHub or Google sign-in joins an existing account only when the provider verified that email (no provider is
// trusted blindly), and only an account whose own address was proven by a code.
export const ACCOUNT_LINKING = { enabled: true, trustedProviders: [] as string[], requireLocalEmailVerified: true };
