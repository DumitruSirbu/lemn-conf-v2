// M7 wave 7D5b slice S0 — the reader for `7d5b-pre-tower-baseline.json`, the pre-state of S0b (the
// oven tower over the bottle, ADR 0110 Amendment M11).
//
// **Captured from `acb7b6f` with the production tree clean**, by the method the earlier recordings
// used: rooms drawn from `approvedLRoom()` at a fixed seed and run count, each composed through
// `planKitchenComposition` over `lShellFloorRuns`, and stored as the whole `canonicalPlan` string, so a
// later comparison names the field and the module that moved. Beside the draw it records the plan's
// named witness rooms at 2600 mm, whole, because a 480-room draw reaches the 5 260-room class S0b
// changes only a handful of times and never at the rooms the plan and the owner reason from.
//
// **Never re-captured to fit a later wave** (plan risk 5): a late 7D5 fix that moved the pre-state is
// a new recording beside this one, not a patch to it. Decoding goes through the pre-width reader's
// `parseRecordedCanonicalPlan`, so the three whole-plan recordings are read by one parser.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DesignRoom } from "../../src/index.js";

const RECORDING_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "generation",
  "7d5b-pre-tower-baseline.json",
);

interface PreTowerRecordingDocument {
  readonly capturedFrom: string;
  readonly seed: number;
  readonly runs: number;
  /** Room key to the whole `canonicalPlan` string, one entry per drawn room. */
  readonly rooms: Readonly<Record<string, string>>;
  /** Room key to the whole `canonicalPlan` string, one entry per named witness. */
  readonly witnesses: Readonly<Record<string, string>>;
}

export interface PreTowerRunRecording {
  readonly capturedFrom: string;
  readonly seed: number;
  readonly runs: number;
  readonly rooms: ReadonlyMap<string, string>;
  readonly witnesses: ReadonlyMap<string, string>;
}

export function readPreTowerRunRecording(): PreTowerRunRecording {
  const document = JSON.parse(
    readFileSync(RECORDING_FILE, "utf8"),
  ) as PreTowerRecordingDocument;
  const rooms = new Map(Object.entries(document.rooms));
  if (rooms.size !== document.runs) {
    throw new Error(
      `the 7D5b pre-tower recording declares ${String(document.runs)} runs but holds ${String(rooms.size)} distinct rooms`,
    );
  }
  const witnesses = new Map(Object.entries(document.witnesses));
  if (witnesses.size === 0) {
    throw new Error("the 7D5b pre-tower recording holds no witness room");
  }
  return {
    capturedFrom: document.capturedFrom,
    seed: document.seed,
    runs: document.runs,
    rooms,
    witnesses,
  };
}

/** The room a recording key names: `<width>x<depth>x<height>`, all whole millimetres. */
export function roomFromRecordedKey(key: string): DesignRoom {
  const [widthMm, depthMm, heightMm, ...rest] = key.split("x").map(Number);
  const isWhole = (value: number | undefined): value is number =>
    value !== undefined && Number.isInteger(value);
  if (
    rest.length > 0 ||
    !isWhole(widthMm) ||
    !isWhole(depthMm) ||
    !isWhole(heightMm)
  ) {
    throw new Error(
      `the 7D5b pre-tower recording holds an invalid room key: ${key}`,
    );
  }
  return { shape: "L", widthMm, depthMm, heightMm };
}
