// Parses an active-learning queue import: a JSONL file of
// {clipId, t, code, conf} model outputs (§13: "confidence display for
// active learning"). One JSON object per line; blank lines are skipped;
// malformed lines are dropped and reported rather than crashing the import
// (same "drop and count at the ingest boundary" rule as the fusion engine's
// event schemas — see apps/web/src/fusion/diagnosis.ts header).
import { z } from "zod";
import type { QueueItem } from "../store/clipStore";

const QueueItemSchema = z.object({
  clipId: z.string().min(1),
  t: z.number().min(0),
  code: z.string().min(1),
  conf: z.number().min(0).max(1),
});

export interface ParseJsonlResult {
  items: QueueItem[];
  errors: { line: number; message: string }[];
}

export function parseQueueJsonl(text: string): ParseJsonlResult {
  const items: QueueItem[] = [];
  const errors: { line: number; message: string }[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    try {
      const parsed = QueueItemSchema.parse(JSON.parse(raw));
      items.push(parsed);
    } catch (e) {
      errors.push({ line: i + 1, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { items, errors };
}
