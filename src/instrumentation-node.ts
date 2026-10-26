import { mailStartupCheck } from "@/lib/mail-driver";
import { startupProblems, startupWarnings } from "@/lib/startup";

// Node-only startup checks (imported by instrumentation.ts on the Node runtime).
export function checkStartup() {
  for (const warning of startupWarnings(process.env)) console.warn(`[lovewall] ${warning}`);
  const problems = startupProblems(process.env);
  for (const problem of problems) console.error(`[lovewall] ${problem}`);
  const mail = mailStartupCheck(process.env);
  if (mail === "fail") {
    console.error(
      "[lovewall] MAIL_DRIVER=log prints sign-in codes to the server log and is not allowed in production. Set up ZeptoMail or SMTP.",
    );
  }
  if (problems.length || mail === "fail") process.exit(1);
  if (mail === "warn")
    console.warn("[lovewall] No mail provider set: sign-in codes are printed to the server log. Set up ZeptoMail or SMTP.");
}
