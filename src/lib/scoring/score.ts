import type { Role } from "@/config/scoring";
import { generateJson, toResponseSchema } from "@/lib/gemini";
import { ScoringOutput } from "./schema";
import { buildSystemPrompt, buildUserMessage } from "./prompt";

export interface ScoreResult {
  output: ScoringOutput;
  model: string;
}

const RESPONSE_SCHEMA = toResponseSchema(ScoringOutput);

/**
 * Scores one redacted CV against both rubrics. The text passed here must
 * already have personal details removed (lib/redact.ts).
 */
export async function scoreCv(opts: { candidateId: string; taggedRole: Role | null; redactedText: string }): Promise<ScoreResult> {
  const { data, model } = await generateJson({
    schema: ScoringOutput,
    responseSchema: RESPONSE_SCHEMA,
    system: buildSystemPrompt(),
    user: buildUserMessage(opts),
  });
  return { output: data, model };
}
