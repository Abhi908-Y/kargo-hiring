// Local demo mode: run the whole app on this computer before any API keys exist.
// Data lives in .demo-data/, there is no login, emails are simulated, and CVs are
// scored by a keyword heuristic unless GEMINI_API_KEY is set.
//
// Never active on Vercel: demo mode has no authentication.

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE?.trim().toLowerCase() === "true" && !process.env.VERCEL;
}

export const DEMO_USER = "demo@localhost";
