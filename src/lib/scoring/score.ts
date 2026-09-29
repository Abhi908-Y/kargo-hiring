import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, type Role } from "@/config/scoring";
import { ScoringOutput } from "./schema";
import { buildSystemPrompt, buildUserMessage } from "./prompt";

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ maxRetries: 3 });
  return client;
}

export class ScoringError extends Error {}

export interface ScoreResult {
  output: ScoringOutput;
  model: string;
  usage: { input: number; output: number; cacheRead: number };
}

/**
 * Scores one redacted CV. The text passed here must already have personal
 * details removed (see lib/redact.ts); this function never sees contact data.
 */
export async function scoreCv(opts: {
  candidateId: string;
  taggedRole: Role | null;
  redactedText: string;
}): Promise<ScoreResult> {
  const request = {
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text" as const, text: buildSystemPrompt(), cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: buildUserMessage(opts) }],
    output_config: { effort: "high" as const, format: zodOutputFormat(ScoringOutput) },
  };

  // One extra attempt if the model's JSON fails validation; API errors are
  // already retried by the SDK.
  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await getClient().messages.parse(request);
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new ScoringError("Anthropic API key is missing or invalid.");
      if (error instanceof Anthropic.RateLimitError) throw new ScoringError("Anthropic rate limit hit. Retry in a minute.");
      if (error instanceof Anthropic.APIError) throw new ScoringError(`Anthropic API error ${error.status}: ${error.message}`);
      if (error instanceof Error && /parse|json|schema/i.test(error.message)) {
        lastProblem = error.message;
        continue;
      }
      throw error;
    }

    if (response.stop_reason === "refusal") throw new ScoringError("The model declined to score this CV.");
    if (response.stop_reason === "max_tokens") {
      lastProblem = "response was cut off";
      continue;
    }
    if (!response.parsed_output) {
      lastProblem = "response did not match the scoring schema";
      continue;
    }
    return {
      output: response.parsed_output,
      model: response.model,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
  throw new ScoringError(`Scoring failed: ${lastProblem}`);
}
