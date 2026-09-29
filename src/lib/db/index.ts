import "server-only";
import { isDemoMode } from "@/lib/demo/mode";
import { memoryDb } from "./memory";
import { neonDb } from "./neon";
import type { Db } from "./query";

let neonInstance: Db | null = null;

/** Data access for the whole app. Only call after requireAdmin(). */
export function db(): Db {
  if (isDemoMode()) return memoryDb();
  if (!neonInstance) neonInstance = neonDb();
  return neonInstance;
}

export type { Db } from "./query";
