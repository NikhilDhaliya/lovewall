import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { withClientIp } from "@/lib/ip";

const handler = toNextJsHandler(auth);

// Better Auth reads the visitor's IP from one header that only Lovewall sets: it is filled in here, from the same
// source as every other rate limit, replacing anything the client sent.
export const GET = (request: Request) => handler.GET(withClientIp(request));
export const POST = (request: Request) => handler.POST(withClientIp(request));
