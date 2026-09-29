import { ApiError, FinishReason, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { GEMINI_MODEL, type Role } from "@/config/scoring";
import { ScoringOutput } from "./schema";
import { buildSystemPrompt, buildUserMessage } from "./prompt";

let client: GoogleGenAI | null = null;
function getClient() {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new ScoringError("GEMINI_API_KEY is not set.");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export class ScoringError extends Error {}

export interface ScoreResult {
  output: ScoringOutput;
  model: string;
  usage: { input: number; output: number; cacheRead: number };
}

// JSON Schema sent to Gemini so the reply matches the rubric's output schema.
const { $schema: _unused, ...RESPONSE_SCHEMA } = z.toJSONSchema(ScoringOutput) as Record<string, unknown>;
void _unused;

export function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || GEMINI_MODEL;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Scores one redacted CV. The text passed here must already have personal
 * details removed (see lib/redact.ts); this function never sees contact data.
 */
export async function scoreCv(opts: {
  candidateId: string;
  taggedRole: Role | null;
  redactedText: string;
}): Promise<ScoreResult> {
  const model = geminiModel();
  let lastProblem = "";

  // Up to 3 attempts: retries rate limits / server errors and replies that
  // don't match the schema. Other API errors fail straight away.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(2000 * attempt);

    let response;
    try {
      response = await getClient().models.generateContent({
        model,
        contents: buildUserMessage(opts),
        config: {
          systemInstruction: buildSystemPrompt(),
          responseMimeType: "application/json",
          responseJsonSchema: RESPONSE_SCHEMA,
          maxOutputTokens: 16000,
        },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401 || error.status === 403) throw new ScoringError("Gemini API key is missing or invalid.");
        if (error.status === 404) throw new ScoringError(`Gemini model "${model}" was not found. Check GEMINI_MODEL.`);
        if (error.status === 429 || error.status >= 500) {
          lastProblem = error.status === 429 ? "Gemini rate limit hit" : `Gemini server error ${error.status}`;
          continue;
        }
        throw new ScoringError(`Gemini API error ${error.status}: ${error.message}`);
      }
      throw error;
    }

    const finish = response.candidates?.[0]?.finishReason;
    if (finish === FinishReason.SAFETY || response.promptFeedback?.blockReason)
      throw new ScoringError("Gemini declined to score this CV (safety filter).");
    if (finish === FinishReason.MAX_TOKENS) {
      lastProblem = "response was cut off";
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text ?? "");
    } catch {
      lastProblem = "response was not valid JSON";
      continue;
    }
    const result = ScoringOutput.safeParse(parsed);
    if (!result.success) {
      lastProblem = "response did not match the scoring schema";
      continue;
    }

    const usage = response.usageMetadata;
    return {
      output: result.data,
      model: response.modelVersion ?? model,
      usage: {
        input: usage?.promptTokenCount ?? 0,
        output: usage?.candidatesTokenCount ?? 0,
        cacheRead: usage?.cachedContentTokenCount ?? 0,
      },
    };
  }
  throw new ScoringError(`Scoring failed: ${lastProblem}`);
}
