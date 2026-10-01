import "server-only";
import { db } from "@/lib/db";
import type { CandidateNote } from "@/lib/types";

// Arjun's private notes on a candidate. Never sent to the AI.

export async function getNotes(candidateId: string): Promise<CandidateNote[]> {
  const { data } = await db().from("candidate_notes").select("*").eq("candidate_id", candidateId).order("created_at", { ascending: false });
  return (data ?? []) as CandidateNote[];
}

/** Latest note per candidate, plus how many there are, for the candidate cards. */
export async function latestNotes(): Promise<Map<string, { body: string; created_at: string; count: number }>> {
  const { data } = await db().from("candidate_notes").select("candidate_id, body, created_at").order("created_at", { ascending: false });
  const map = new Map<string, { body: string; created_at: string; count: number }>();
  for (const n of (data ?? []) as CandidateNote[]) {
    const existing = map.get(n.candidate_id);
    if (existing) existing.count++;
    else map.set(n.candidate_id, { body: n.body, created_at: n.created_at, count: 1 });
  }
  return map;
}

export async function addNote(candidateId: string, body: string): Promise<string | null> {
  const text = body.trim();
  if (!text) return "The note is empty.";
  if (text.length > 5000) return "Notes can be up to 5,000 characters.";
  const { data: c } = await db().from("candidates").select("id").eq("id", candidateId).maybeSingle();
  if (!c) return "Candidate not found.";
  const { error } = await db().from("candidate_notes").insert({ candidate_id: candidateId, body: text });
  return error ? error.message : null;
}

export async function deleteNote(candidateId: string, noteId: number): Promise<string | null> {
  const { error } = await db().from("candidate_notes").delete().eq("id", noteId).eq("candidate_id", candidateId);
  return error ? error.message : null;
}
