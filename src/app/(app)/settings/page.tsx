import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { DEFAULT_SETTINGS, type Role } from "@/config/scoring";
import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/demo/mode";
import { env } from "@/lib/env";
import { geminiModel } from "@/lib/gemini";
import { getSettings } from "@/lib/settings";
import type { RubricCriterionRow } from "@/lib/types";
import { ResetDemoButton, SettingsForm } from "./SettingsForm";

export const metadata = { title: "Settings · Kargo Hiring" };

export default async function SettingsPage() {
  const [settings, rubricRes] = await Promise.all([
    getSettings(),
    db().from("rubric_criteria").select("*").order("role").order("sort_order"),
  ]);
  const rubric = (rubricRes.data ?? []) as RubricCriterionRow[];
  const demo = isDemoMode();
  const testMode = env.testMode();

  const rows: [string, string][] = [
    ["Test mode", testMode ? `ON: all emails go to ${env.testModeEmail() ?? "(TEST_MODE_EMAIL not set)"}` : "OFF: emails go to the candidate's address"],
    ["Sender", `${env.emailFromName()} <${env.emailFrom()}>`],
    ["Replies go to", env.emailReplyTo() ?? "Sender address"],
    ["Email delivery", env.resendApiKey() ? "Resend" : "Recorded only (RESEND_API_KEY not set)"],
    ["AI", demo && !process.env.GEMINI_API_KEY ? "Demo keyword heuristic (no GEMINI_API_KEY)" : `Google Gemini · ${geminiModel()}`],
    ["Database", demo ? "Local demo file (.demo-data)" : "Neon Postgres"],
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" />
      <Card>
        <SectionTitle>Shortlist</SectionTitle>
        <SettingsForm initial={settings} defaults={DEFAULT_SETTINGS} />
      </Card>

      <Card>
        <SectionTitle hint="rubric_criteria table · from rubric/arjun_rubric.md">Rubric</SectionTitle>
        {rubric.length === 0 ? (
          <p className="text-sm text-rose-700">The rubric_criteria table is empty. Run npm run db:setup.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {(["PM", "SPM"] as Role[]).map((role) => {
              const rows = rubric.filter((r) => r.role === role);
              return (
                <div key={role}>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">
                    {role === "PM" ? "Product Manager" : "Senior Product Manager"} · {rows.reduce((s, r) => s + r.weight_pct, 0)}%
                  </h3>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {rows.map((r) => (
                      <li key={r.id} className="p-3">
                        <details>
                          <summary className="flex cursor-pointer items-baseline justify-between gap-3 text-sm">
                            <span>
                              <span className="mr-1 text-xs font-semibold text-slate-400">{r.code}</span>
                              <span className="font-medium text-slate-900">{r.name}</span>
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{r.weight_pct}%</span>
                          </summary>
                          <p className="mt-2 text-xs leading-relaxed text-slate-600">{r.description}</p>
                        </details>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle hint="Set in environment variables">Email & system</SectionTitle>
        <dl className="divide-y divide-slate-100 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-2 py-2">
              <dt className="text-slate-500">{k}</dt>
              <dd className="font-medium text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {demo && (
        <Card>
          <SectionTitle>Demo data</SectionTitle>
          <p className="mb-3 text-sm text-slate-600">
            Everything is stored in the <code>.demo-data</code> folder on this computer. Resetting deletes all demo candidates, emails, files and settings.
          </p>
          <ResetDemoButton />
        </Card>
      )}
    </div>
  );
}
