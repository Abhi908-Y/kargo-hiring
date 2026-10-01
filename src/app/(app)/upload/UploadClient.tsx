"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { cx } from "@/components/ui";

type RoleChoice = "PM" | "SPM" | "untagged";
type Status = "ready" | "uploading" | "scoring" | "done" | "skipped" | "error";

interface Item {
  key: string;
  file: File;
  role: RoleChoice;
  status: Status;
  progress: number;
  message?: string;
  result?: { id: string; stage: string; total: number | null; role: string | null; scoringError: string | null };
}

const MAX_BYTES = 4 * 1024 * 1024;
const BAND_TEXT: Record<string, string> = {
  auto_invite: "Auto-selected",
  auto_reject: "Auto-rejected",
  review: "Review",
};

function validate(file: File): string | null {
  if (!/\.(pdf|docx)$/i.test(file.name)) return "Only .pdf and .docx files are supported.";
  if (file.size > MAX_BYTES) return "File is larger than 4 MB.";
  return null;
}

function uploadWithProgress(file: File, role: RoleChoice, onProgress: (pct: number) => void) {
  return new Promise<{ status: number; body: { id?: string; error?: string; warning?: string } }>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("role", role);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(form);
  });
}

export function UploadClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [defaultRole, setDefaultRole] = useState<RoleChoice>("PM");
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [drafting, setDrafting] = useState<{ done: number; total: number; error?: string; finished?: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    setItems((prev) => {
      const seen = new Set(prev.map((p) => `${p.file.name}:${p.file.size}`));
      const added: Item[] = [];
      for (const file of incoming) {
        const id = `${file.name}:${file.size}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const problem = validate(file);
        added.push({
          key: `${id}:${Math.random().toString(36).slice(2)}`,
          file,
          role: defaultRole,
          status: problem ? "error" : "ready",
          progress: 0,
          message: problem ?? undefined,
        });
      }
      return [...prev, ...added];
    });
  }

  async function processOne(item: Item) {
    update(item.key, { status: "uploading", progress: 2, message: "Uploading and removing personal details…" });
    let uploaded;
    try {
      uploaded = await uploadWithProgress(item.file, item.role, (p) => update(item.key, { progress: Math.round(2 + p * 33) }));
    } catch {
      update(item.key, { status: "error", progress: 100, message: "Network error while uploading. Try again." });
      return;
    }
    if (uploaded.status === 409) {
      update(item.key, { status: "skipped", progress: 100, message: uploaded.body.error });
      return;
    }
    if (uploaded.status !== 200 || !uploaded.body.id) {
      update(item.key, { status: "error", progress: 100, message: uploaded.body.error ?? `Upload failed (${uploaded.status}).` });
      return;
    }

    const id = uploaded.body.id;
    update(item.key, { status: "scoring", progress: 40, message: "Scoring against the rubric (about 30–60 seconds)…" });
    // Scoring gives no progress events, so ease towards 95% while waiting.
    const timer = setInterval(() => {
      setItems((prev) =>
        prev.map((it) => (it.key === item.key && it.status === "scoring" ? { ...it, progress: Math.min(95, it.progress + (95 - it.progress) * 0.06) } : it)),
      );
    }, 1000);
    try {
      const res = await fetch(`/api/candidates/${id}/score`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        update(item.key, {
          status: "error",
          progress: 100,
          message: `${body.error ?? `Scoring failed (${res.status})`}. The CV is saved; retry from its page.`,
          result: { id, stage: "processing", total: null, role: null, scoringError: body.error ?? "failed" },
        });
        return;
      }
      update(item.key, {
        status: body.scoringError ? "error" : "done",
        progress: 100,
        message: body.scoringError
          ? `Scoring failed (${body.scoringError}). The CV is saved; retry from the dashboard.`
          : `Scored: PM ${body.scorePm}/100 · SPM ${body.scoreSpm}/100 (as ${body.role}) → ${BAND_TEXT[body.band] ?? body.band}`,
        result: { id, stage: body.stage, total: body.total, role: body.role, scoringError: body.scoringError },
      });
    } catch {
      update(item.key, {
        status: "error",
        progress: 100,
        message: "Lost connection while scoring. The CV is saved. Open it to check or retry.",
        result: { id, stage: "processing", total: null, role: null, scoringError: "network" },
      });
    } finally {
      clearInterval(timer);
    }
  }

  async function start() {
    setRunning(true);
    // One CV per request, one at a time.
    const queue = items.filter((i) => i.status === "ready");
    for (const item of queue) {
      await processOne(item);
    }
    // Then steps 2 + 3: interview briefs for the top candidates and a draft email for everyone.
    setDrafting({ done: 0, total: 0 });
    let done = 0;
    for (let guard = 0; guard < 500; guard++) {
      const res = await fetch("/api/drafts/refresh", { method: "POST" }).catch(() => null);
      const data = res?.ok ? await res.json().catch(() => null) : null;
      if (!data) {
        setDrafting({ done, total: done, error: "Couldn't write all drafts. Use \"Write drafts now\" on the dashboard." });
        break;
      }
      if (!data.drafted) break;
      done++;
      setDrafting({ done, total: done + data.remaining });
      if (data.remaining === 0) break;
    }
    setDrafting((d) => (d?.error ? d : { done, total: done, finished: true }));
    setRunning(false);
  }

  const ready = items.filter((i) => i.status === "ready").length;
  const finished = items.filter((i) => ["done", "skipped", "error"].includes(i.status)).length;
  const active = items.filter((i) => i.status !== "error" || i.result).length;
  const added = items.filter((i) => i.status === "done").length;
  const skipped = items.filter((i) => i.status === "skipped").length;
  const failed = items.filter((i) => i.status === "error").length;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!running) addFiles(e.dataTransfer.files);
        }}
        className={cx(
          "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white px-6 py-10 text-center transition",
          dragging ? "border-teal-500 bg-teal-50" : "border-slate-300",
        )}
      >
        <p className="text-base font-medium text-slate-900">Drag and drop CVs here</p>
        <p className="mt-1 text-sm text-slate-500">or</p>
        <button
          type="button"
          disabled={running}
          onClick={() => inputRef.current?.click()}
          className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-600">Role for new files:</span>
              <RoleSelect value={defaultRole} onChange={setDefaultRole} disabled={running} />
              <button
                type="button"
                disabled={running || ready === 0}
                onClick={() => setItems((prev) => prev.map((it) => (it.status === "ready" ? { ...it, role: defaultRole } : it)))}
                className="text-xs font-medium text-teal-700 hover:underline disabled:opacity-40"
              >
                Apply to all
              </button>
            </div>
            <div className="flex items-center gap-2">
              {!running && (
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((i) => i.status === "ready"))}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800"
                >
                  Clear finished
                </button>
              )}
              <button
                type="button"
                disabled={running || ready === 0}
                onClick={start}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {running ? "Processing…" : `Upload & score ${ready || ""}`}
              </button>
            </div>
          </div>

          {(running || finished > 0) && (
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="mb-1 flex justify-between text-xs text-slate-600">
                <span>Overall</span>
                <span className="tabular-nums">
                  {finished} of {items.length} done
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${(finished / Math.max(items.length, 1)) * 100}%` }} />
              </div>
            </div>
          )}

          <ul className="divide-y divide-slate-100">
            {items.map((it) => (
              <li key={it.key} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">{it.file.name}</div>
                    <div className="text-xs text-slate-500">{(it.file.size / 1024).toFixed(0)} KB</div>
                  </div>
                  {it.status === "ready" ? (
                    <div className="flex items-center gap-2">
                      <RoleSelect value={it.role} onChange={(role) => update(it.key, { role })} disabled={running} />
                      <button
                        type="button"
                        disabled={running}
                        onClick={() => setItems((prev) => prev.filter((p) => p.key !== it.key))}
                        className="text-xs text-slate-400 hover:text-rose-600"
                        aria-label={`Remove ${it.file.name}`}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{it.role === "untagged" ? "Untagged" : it.role}</span>
                      {it.result?.total != null && <span className="font-semibold tabular-nums text-slate-900">{it.result.total}/100</span>}
                      {it.result && (
                        <Link href={`/candidates/${it.result.id}`} className="font-medium text-teal-700 hover:underline">
                          Open
                        </Link>
                      )}
                    </div>
                  )}
                </div>
                {it.status !== "ready" && (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cx(
                          "h-full rounded-full transition-all duration-700",
                          it.status === "error" ? "bg-rose-500" : it.status === "skipped" ? "bg-amber-400" : "bg-teal-600",
                        )}
                        style={{ width: `${it.progress}%` }}
                      />
                    </div>
                    {it.message && (
                      <p className={cx("mt-1.5 text-xs", it.status === "error" ? "text-rose-700" : it.status === "skipped" ? "font-medium text-amber-800" : "text-slate-600")}>
                        {it.message}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {finished > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg bg-emerald-50 px-3 py-1.5 font-medium text-emerald-800">{added} added</span>
          <span className={cx("rounded-lg px-3 py-1.5 font-medium", skipped ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600")}>
            {skipped} skipped as duplicates (same file or same CV text already uploaded)
          </span>
          <span className={cx("rounded-lg px-3 py-1.5 font-medium", failed ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600")}>{failed} failed</span>
        </div>
      )}
      {drafting && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-1 flex justify-between text-xs text-slate-600">
            <span>Writing interview briefs and email drafts, then sorting into columns</span>
            <span className="tabular-nums">
              {drafting.done} of {drafting.total || "…"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-teal-600 transition-all"
              style={{ width: `${drafting.finished ? 100 : drafting.total ? (drafting.done / drafting.total) * 100 : 5}%` }}
            />
          </div>
          {drafting.error && <p className="mt-2 text-xs text-rose-700">{drafting.error}</p>}
        </div>
      )}
      {active > 0 && finished === items.length && !running && (
        <p className="text-sm text-slate-600">
          All done. <Link href="/review" className="font-medium text-teal-700 hover:underline">Open the review queue</Link> or the <Link href="/" className="font-medium text-teal-700 hover:underline">dashboard</Link>.
        </p>
      )}
    </div>
  );
}

function RoleSelect({ value, onChange, disabled }: { value: RoleChoice; onChange: (r: RoleChoice) => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as RoleChoice)}
      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
    >
      <option value="PM">PM</option>
      <option value="SPM">Senior PM</option>
      <option value="untagged">Untagged (AI picks)</option>
    </select>
  );
}
