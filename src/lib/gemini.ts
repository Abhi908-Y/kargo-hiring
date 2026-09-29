import { ApiError, FinishReason, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { GEMINI_MODEL } from "@/config/scoring";

// One place for every Gemini call: structured JSON output validated with zod,
// retries on rate limits, server errors and replies that don't match the schema.

export class AiError extends Error {}

let client: GoogleGenAI | null = null;
function getClient() {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new AiError("GEMINI_API_KEY is not set.");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || GEMINI_MODEL;
}

export function toResponseSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _drop;
  return rest;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function generateJson<T>(opts: {
  schema: z.ZodType<T>;
  responseSchema: Record<string, unknown>;
  system: string;
  user: string;
  maxOutputTokens?: number;
}): Promise<{ data: T; model: string }> {
  const model = geminiModel();
  let lastProblem = "";

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(2000 * attempt);

    let response;
    try {
      response = await getClient().models.generateContent({
        model,
        contents: opts.user,
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema: opts.responseSchema,
          maxOutputTokens: opts.maxOutputTokens ?? 16000,
        },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401 || error.status === 403) throw new AiError("Gemini API key is missing or invalid.");
        if (error.status === 404) throw new AiError(`Gemini model "${model}" was not found. Check GEMINI_MODEL.`);
        if (error.status === 429 || error.status >= 500) {
          lastProblem = error.status === 429 ? "Gemini rate limit hit" : `Gemini server error ${error.status}`;
          continue;
        }
        throw new AiError(`Gemini API error ${error.status}: ${error.message}`);
      }
      throw error;
    }

    const finish = response.candidates?.[0]?.finishReason;
    if (finish === FinishReason.SAFETY || response.promptFeedback?.blockReason)
      throw new AiError("Gemini declined this request (safety filter).");
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
    const result = opts.schema.safeParse(parsed);
    if (!result.success) {
      lastProblem = "response did not match the expected format";
      continue;
    }
    return { data: result.data, model: response.modelVersion ?? model };
  }
  throw new AiError(`Gemini failed: ${lastProblem}`);
}
