// Runs once when the server starts (not during the build).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { checkStartup } = await import("./instrumentation-node");
  checkStartup();
}
