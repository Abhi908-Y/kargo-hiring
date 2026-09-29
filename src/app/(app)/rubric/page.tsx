import { PageHeader } from "@/components/ui";
import { DIMENSIONS, type Role } from "@/config/scoring";
import { getRubric } from "@/lib/rubric";
import { RubricEditor, type EditorRow } from "./RubricEditor";

export const metadata = { title: "Rubric · Kargo Hiring" };

export default async function RubricPage() {
  const rubric = await getRubric();

  // One editor row per scored dimension; shared criteria carry a weight for each role.
  const rows: EditorRow[] = DIMENSIONS.map((d) => {
    const forRole = (r: Role) => rubric.find((x) => x.dimension_key === d.key && x.role === r);
    const first = forRole(d.roles[0])!;
    return {
      dimension_key: d.key,
      code: d.code,
      max: d.max,
      roles: [...d.roles],
      name: first.name,
      description: first.description,
      weights: Object.fromEntries(d.roles.map((r) => [r, forRole(r)?.weight_pct ?? 0])),
    };
  });

  return (
    <div>
      <PageHeader
        title="Rubric"
        subtitle="How candidates are scored. Weights set how much each criterion counts towards the score out of 100, and must add up to 100% per role. Weight changes re-total every candidate straight away with no AI calls. Name and description changes are used by the AI from the next CV it scores."
      />
      <RubricEditor initial={rows} />
    </div>
  );
}
