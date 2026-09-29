import { Nav } from "@/components/Nav";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/demo/mode";
import { env } from "@/lib/env";
import { finalizeDue } from "@/lib/pipeline";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const email = await requireAdmin();
  await finalizeDue();
  const { count } = await db().from("candidates").select("id", { count: "exact", head: true }).eq("stage", "review");
  const demo = isDemoMode();

  return (
    <div className="min-h-screen">
      {demo && (
        <div className="bg-violet-100 px-4 py-1.5 text-center text-xs font-medium text-violet-900">
          Demo mode: local data, no login, emails recorded but never sent
          {process.env.GEMINI_API_KEY ? "." : ", keyword scorer instead of AI."}
        </div>
      )}
      {!demo && env.testMode() && (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
          Test mode: every email goes to {env.testModeEmail() ?? "TEST_MODE_EMAIL (not set!)"}, not to candidates.
        </div>
      )}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center justify-between pt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold uppercase tracking-widest text-teal-700">Kargo</span>
              <span className="text-sm text-slate-500">Hiring</span>
            </div>
            {demo ? (
              <span className="text-xs text-slate-500">Demo</span>
            ) : (
              <form action="/auth/signout" method="post" className="flex items-center gap-3">
                <span className="hidden text-xs text-slate-500 sm:inline">{email}</span>
                <button className="text-xs font-medium text-slate-500 hover:text-slate-900">Sign out</button>
              </form>
            )}
          </div>
          <Nav reviewCount={count ?? 0} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
