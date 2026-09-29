import { Card, PageHeader, SectionTitle } from "@/components/ui";
import Link from "next/link";
import { DEFAULT_SETTINGS } from "@/config/scoring";
import { isDemoMode } from "@/lib/demo/mode";
import { env } from "@/lib/env";
import { geminiModel } from "@/lib/gemini";
import { getSettings } from "@/lib/settings";
import { ResetDemoButton, SettingsForm } from "./SettingsForm";

export const metadata = { title: "Settings · Kargo Hiring" };

export default async function SettingsPage() {
  const settings = await getSettings();
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
        <SectionTitle>Automatic emails</SectionTitle>
        <SettingsForm initial={settings} defaults={DEFAULT_SETTINGS} />
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">Criteria, descriptions and weights are on the Rubric page.</p>
        <Link href="/rubric" className="text-sm font-medium text-teal-700 hover:underline">Edit the rubric →</Link>
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
