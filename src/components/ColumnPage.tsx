import { CandidateCard } from "@/components/CandidateCard";
import { BulkSendButton } from "@/components/SendButton";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { env } from "@/lib/env";
import { allCandidates, rankCandidates } from "@/lib/pipeline";
import { latestNotes } from "@/lib/notes";
import { getRubric } from "@/lib/rubric";
import { getSettings } from "@/lib/settings";

/** Auto-selected / Auto-rejected column: everyone placed there by score, with one bulk send. */
export async function ColumnPage({ column }: { column: "auto_selected" | "auto_rejected" }) {
  const [candidates, settings, rubric, notes] = await Promise.all([allCandidates(), getSettings(), getRubric(), latestNotes()]);
  const rank = rankCandidates(candidates);
  const list = candidates.filter((c) => c.stage === column).sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0));
  const namesFor = (role: "PM" | "SPM") => Object.fromEntries(rubric.filter((r) => r.role === role).map((r) => [r.dimension_key, r.name]));
  const selected = column === "auto_selected";
  const noEmail = list.filter((c) => !c.email).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title={selected ? "Auto-selected" : "Auto-rejected"}
        subtitle={
          selected
            ? `Scores above ${settings.autoInviteAbove}. Each has an AI interview invite ready. Nothing is sent until you click Send.`
            : `Scores below ${settings.autoRejectBelow}. Each has an AI rejection ready. Nothing is sent until you click Send.`
        }
      />

      <Card className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl text-sm text-slate-700">
          <p>
            Send everyone in this column their {selected ? "interview invite" : "rejection"} in one go, or send one at a time from the cards. If you
            disagree with where someone landed, use <b>Move to review</b> on their card first.
          </p>
          {env.testMode() && <p className="mt-2 text-xs text-slate-500">Test mode is on: every email goes to {env.testModeEmail()}.</p>}
          {noEmail > 0 && <p className="mt-2 text-xs text-rose-700">{noEmail} candidate(s) have no email address and will be skipped.</p>}
        </div>
        <BulkSendButton column={column} count={list.length} />
      </Card>

      {list.length === 0 ? (
        <EmptyState>Nobody here right now.</EmptyState>
      ) : (
        <div className="space-y-4">
          {list.map((c) => (
            <CandidateCard
              key={c.id}
              note={notes.get(c.id)}
              c={c}
              role={c.assigned_role ?? "PM"}
              rank={rank.get(c.id) ?? null}
              calendarLink={settings.calendarLink}
              names={namesFor(c.assigned_role ?? "PM")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
