// M7 wave 7D8 slice S4 — the reader for `7d8-re-keyed-baseline.json`.
//
// **Whole canonical plans rather than digests, which is the one way this recording differs from
// 7D3's.** A digest answers *did it change*, and for the 82 rooms the re-key moved that is the only
// answer 7D3's recording can still give — the gap this file exists to close for the next wave. A
// recorded plan answers *what changed to what*, in the same `canonicalPlan` form the witnesses are
// pinned in, at 30 KB for the 82 rooms.
//
// What the recording may and may not be used for is stated where it is read:
// `qa-7d8-the-re-keyed-half-recorded.test.ts`. In one line: it is evidence for the next wave and
// never for 7D8, because it was captured from 7D8's own output.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RECORDING_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "generation",
  "7d8-re-keyed-baseline.json",
);

interface ReKeyedRecordingDocument {
  readonly capturedFrom: string;
  readonly seed: number;
  readonly runs: number;
  /** Room key to the whole `canonicalPlan` string, one entry per re-keyed room. */
  readonly rooms: Readonly<Record<string, string>>;
}

export function readReKeyedRunRecording(): ReadonlyMap<string, string> {
  const document = JSON.parse(
    readFileSync(RECORDING_FILE, "utf8"),
  ) as ReKeyedRecordingDocument;
  if (Object.keys(document.rooms).length === 0) {
    throw new Error("the 7D8 re-keyed recording holds no room");
  }
  return new Map(Object.entries(document.rooms));
}
