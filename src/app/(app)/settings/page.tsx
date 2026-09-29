import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { DEFAULT_SETTINGS } from "@/config/scoring";
import { geminiModel } from "@/lib/scoring/score";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { isDemoMode } from "@/lib/demo/mode";
import { ResetDemoButton, SettingsForm } from "./SettingsForm";

export const metadata = { title: "Settings · Kargo Hiring" };

export default async function SettingsPage() {
  const settings = await getSettings();
  const testMode = env.testMode();
  const demo = isDemoMode();

  const rows: [string, string][] = [
    ["Test mode", testMode ? `ON: all emails go to ${env.testModeEmail() ?? "(TEST_MODE_EMAIL not set)"}` : "OFF: emails go to candidates"],
    ["Sender", `${env.emailFromName()} <${env.emailFrom()}>`],
    ["Replies go to", env.emailReplyTo() ?? "Sender address"],
    ["Email delivery", env.resendApiKey() ? "Resend" : "Simulated (RESEND_API_KEY not set)"],
    ["Scoring model", demo && !process.env.GEMINI_API_KEY ? "Demo keyword heuristic (no GEMINI_API_KEY)" : `Google Gemini · ${geminiModel()}`],
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Tune the routing after calibration. Changes apply to CVs scored from now on." />
      <Card>
        <SectionTitle>Routing thresholds</SectionTitle>
        <SettingsForm initial={settings} defaults={DEFAULT_SETTINGS} />
      </Card>
      <Card>
        <SectionTitle hint="Set in environment variables (Vercel → Settings → Environment Variables)">Email & system</SectionTitle>
        <dl className="divide-y divide-slate-100 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-2 py-2">
              <dt className="text-slate-500">{k}</dt>
              <dd className="font-medium text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          To go live: verify your domain in Resend, set EMAIL_FROM_ADDRESS to an address on it, set TEST_MODE=false, and redeploy.
        </p>
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
