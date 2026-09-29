import Link from "next/link";
import { EmptyState, PageHeader, RoleChip, StageBadge, cx, displayName, formatDate, scoreColor } from "@/components/ui";
import { db } from "@/lib/supabase/server";
import type { Candidate } from "@/lib/types";

export const metadata = { title: "Candidates · Kargo Hiring" };

const STAGE_FILTERS = [
  { value: "all", label: "All", stages: null },
  { value: "review", label: "In review", stages: ["review"] },
  { value: "shortlisted", label: "Shortlisted", stages: ["shortlisted", "shortlist_pending"] },
  { value: "rejected", label: "Rejected", stages: ["rejected", "reject_pending"] },
  { value: "processing", label: "Not scored", stages: ["processing"] },
] as const;
const ROLE_FILTERS = ["all", "PM", "SPM"] as const;

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ stage?: string; role?: string }> }) {
  const params = await searchParams;
  const stageFilter = STAGE_FILTERS.find((f) => f.value === params.stage) ?? STAGE_FILTERS[0];
  const roleFilter = ROLE_FILTERS.find((r) => r === params.role) ?? "all";

  let query = db()
    .from("candidates")
    .select("id, created_at, file_name, full_name, stage, band, total_score, pattern_score, role_fit_score, assigned_role, tagged_role, role_source, rescued, role_mismatch, flags")
    .order("total_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (stageFilter.stages) query = query.in("stage", [...stageFilter.stages]);
  if (roleFilter !== "all") query = query.eq("assigned_role", roleFilter);
  const { data } = await query;
  const candidates = (data ?? []) as Candidate[];

  const href = (stage: string, role: string) => {
    const p = new URLSearchParams();
    if (stage !== "all") p.set("stage", stage);
    if (role !== "all") p.set("role", role);
    const s = p.toString();
    return s ? `/candidates?${s}` : "/candidates";
  };

  return (
    <div>
      <PageHeader title="All candidates" subtitle="Ranked by total score." />

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-1">
          {STAGE_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={href(f.value, roleFilter)}
              className={cx(
                "rounded-full px-3 py-1 text-sm",
                f.value === stageFilter.value ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-1">
          {ROLE_FILTERS.map((r) => (
            <Link
              key={r}
              href={href(stageFilter.value, r)}
              className={cx(
                "rounded-full px-3 py-1 text-sm",
                r === roleFilter ? "bg-teal-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {r === "all" ? "Both roles" : r}
            </Link>
          ))}
        </div>
      </div>

      {candidates.length === 0 ? (
        <EmptyState>No candidates match these filters.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Candidate</th>
                <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Role</th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
                <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Pattern</th>
                <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Role fit</th>
                <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Status</th>
                <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.map((c, i) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-3 py-3 tabular-nums text-slate-400">{i + 1}</td>
                  <td className="px-3 py-3">
                    <Link href={`/candidates/${c.id}`} className="font-medium text-slate-900 hover:underline">
                      {displayName(c)}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                      <RoleChip role={c.assigned_role ?? c.tagged_role} />
                      <StageBadge stage={c.stage} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.rescued && <span className="rounded bg-violet-50 px-1.5 text-[11px] font-medium text-violet-700">Rescued</span>}
                      {c.role_mismatch && <span className="rounded bg-sky-50 px-1.5 text-[11px] font-medium text-sky-700">Role mismatch</span>}
                      {c.flags.includes("location") && <span className="rounded bg-slate-100 px-1.5 text-[11px] font-medium text-slate-600">Outside Mumbai</span>}
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 sm:table-cell">
                    <RoleChip role={c.assigned_role ?? c.tagged_role} inferred={c.role_source === "inferred"} />
                  </td>
                  <td className={cx("px-3 py-3 text-right text-base font-semibold tabular-nums", scoreColor(c.total_score, c.band))}>{c.total_score ?? "–"}</td>
                  <td className="hidden px-3 py-3 text-right tabular-nums text-slate-600 md:table-cell">{c.pattern_score ?? "–"}/60</td>
                  <td className="hidden px-3 py-3 text-right tabular-nums text-slate-600 md:table-cell">{c.role_fit_score ?? "–"}/40</td>
                  <td className="hidden px-3 py-3 sm:table-cell">
                    <StageBadge stage={c.stage} />
                  </td>
                  <td className="hidden px-3 py-3 text-slate-500 lg:table-cell">{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
