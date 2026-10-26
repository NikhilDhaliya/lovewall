import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";

export type User = { id: string; email: string; name: string; image: string | null };

export const currentUser = cache(async (): Promise<User | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, email, name, image } = session.user;
  return { id, email, name: name ?? "", image: image ?? null };
});

export async function requireUser(next?: string): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

// For server actions: no redirect, just a refusal.
export async function actionUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new Error("Signed out");
  return user;
}
