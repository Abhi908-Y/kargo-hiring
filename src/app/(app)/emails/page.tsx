import Link from "next/link";
import { EmptyState, PageHeader, cx, formatDateTime } from "@/components/ui";
import { db } from "@/lib/db";
import type { EmailRow } from "@/lib/types";

export const metadata = { title: "Sent emails · Kargo Hiring" };

export default async function EmailsPage() {
  const { data } = await db()
    .from("emails")
    .select("*, candidates(full_name, file_name)")
    .order("created_at", { ascending: false })
    .limit(500);
  const emails = (data ?? []) as (EmailRow & { candidates: { full_name: string | null; file_name: string } | null })[];

  return (
    <div>
      <PageHeader title="Sent emails" subtitle="Every email you confirmed, newest first." />
      {emails.length === 0 ? (
        <EmptyState>Nothing sent yet. Emails only go out when you click Confirm on a candidate.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {emails.map((e) => (
            <li key={e.id}>
              <details className="rounded-2xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className={cx("text-xs font-semibold capitalize", e.kind === "invite" ? "text-emerald-800" : "text-rose-800")}>{e.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                    {e.candidates?.full_name ?? e.candidates?.file_name ?? e.intended_to}
                    <span className="ml-2 font-normal text-slate-500">{e.intended_to}</span>
                  </span>
                  <span className={cx("rounded px-1.5 py-0.5 text-xs font-medium", e.status === "sent" ? "bg-emerald-50 text-emerald-800" : e.status === "failed" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700")}>
                    {e.status}
                  </span>
                  {e.simulated && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">not delivered</span>}
                  {e.test_mode && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">test → {e.delivered_to}</span>}
                  <span className="text-xs text-slate-500">{formatDateTime(e.sent_at ?? e.created_at)}</span>
                </summary>
                <div className="border-t border-slate-100 px-4 py-3 text-sm">
                  <div className="text-xs text-slate-500">From {e.from_address ?? "–"}</div>
                  <div className="mt-1 font-medium text-slate-900">{e.subject}</div>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-slate-700">{e.body_text}</pre>
                  {e.error && <p className="mt-2 text-rose-700">Error: {e.error}</p>}
                  <Link href={`/candidates/${e.candidate_id}`} className="mt-3 inline-block text-xs font-medium text-teal-700 hover:underline">
                    Open candidate →
                  </Link>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
