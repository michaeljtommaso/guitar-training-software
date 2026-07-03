// Imports a JSONL of {clipId, t, code, conf} model outputs and ranks them by
// ascending confidence — most uncertain (hardest for the model) first — so
// annotators label the clips that will move the model the most (§13:
// "confidence display for active learning").
import { parseQueueJsonl } from "../io/jsonlParse";
import type { QueueItem } from "../store/clipStore";

export interface ActiveLearningQueueProps {
  queue: QueueItem[];
  onImport(items: QueueItem[]): void;
  onSelect(item: QueueItem): void;
}

export function ActiveLearningQueue({ queue, onImport, onSelect }: ActiveLearningQueueProps) {
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const { items, errors } = parseQueueJsonl(text);
    if (errors.length > 0) {
      console.warn(`active-learning queue: dropped ${errors.length} malformed line(s)`, errors);
    }
    onImport(items);
    e.target.value = "";
  };

  return (
    <section className="panel">
      <h2>Active-learning queue</h2>
      <input type="file" accept=".jsonl,.txt" onChange={(e) => void handleFile(e)} aria-label="Import active-learning JSONL" />
      <ol className="queue-list">
        {queue.map((item, i) => (
          <li key={`${item.clipId}-${item.t}-${i}`}>
            <button type="button" onClick={() => onSelect(item)}>
              conf {item.conf.toFixed(2)} — {item.clipId} @ {item.t.toFixed(2)}s — {item.code}
            </button>
          </li>
        ))}
        {queue.length === 0 && <li className="empty">No queue loaded.</li>}
      </ol>
    </section>
  );
}
