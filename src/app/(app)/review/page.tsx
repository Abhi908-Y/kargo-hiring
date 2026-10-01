import { CandidateCard } from "@/components/CandidateCard";
import { EmptyState, PageHeader } from "@/components/ui";
import { allCandidates, rankCandidates } from "@/lib/pipeline";
import { latestNotes } from "@/lib/notes";
import { getRubric } from "@/lib/rubric";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Review · Kargo Hiring" };

export default async function ReviewPage() {
  const [candidates, settings, rubric, notes] = await Promise.all([allCandidates(), getSettings(), getRubric(), latestNotes()]);
  const rank = rankCandidates(candidates);
  const queue = candidates
    .filter((c) => c.stage === "review")
    .sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0));
  const namesFor = (role: "PM" | "SPM") => Object.fromEntries(rubric.filter((r) => r.role === role).map((r) => [r.dimension_key, r.name]));

  return (
    <div>
      <PageHeader
        title="Review queue"
        subtitle={`Scores from ${settings.autoRejectBelow} to ${settings.autoInviteAbove}, plus anyone you moved here or a safety check sent here. Highest score first. Each has an invite and a rejection draft ready: open one and send it.`}
      />
      {queue.length === 0 ? (
        <EmptyState>Nothing waiting for review.</EmptyState>
      ) : (
        <div className="space-y-4">
          {queue.map((c) => (
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
