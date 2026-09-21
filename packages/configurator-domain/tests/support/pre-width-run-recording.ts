// M7 wave 7D5 pre-width recording. The file this reader opens was captured before S1 added the
// 300 mm bottle cabinet. It records the whole canonical plan for every sampled room, rather than a
// digest, so a later comparison can name the exact field and module that moved.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RECORDING_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "generation",
  "7d5-pre-width-baseline.json",
);

interface PreWidthRecordingDocument {
  readonly capturedFrom: string;
  readonly seed: number;
  readonly runs: number;
  /** Room key to the whole pre-S1 `canonicalPlan` string. */
  readonly rooms: Readonly<Record<string, string>>;
}

export interface PreWidthRunRecording {
  readonly capturedFrom: string;
  readonly seed: number;
  readonly runs: number;
  readonly rooms: ReadonlyMap<string, string>;
}

export interface RecordedPlanModule {
  readonly id: string;
  readonly role: string;
  readonly buildId: string;
  readonly wall: "A" | "B";
  readonly startMm: number;
  readonly endMm: number;
  readonly widthMm: number;
}

export interface RecordedCanonicalPlan {
  readonly minimumMet: boolean;
  readonly cut: number;
  readonly dropped: readonly string[];
  readonly remainderMm: Readonly<Record<"A" | "B", number>>;
  readonly floorWidthsMm: Readonly<Record<"A" | "B", readonly number[]>>;
  readonly bases: readonly RecordedPlanModule[];
}

/** Parses the frozen textual form without asking the current composer how any field should read. */
export function parseRecordedCanonicalPlan(
  canonical: string,
): RecordedCanonicalPlan {
  const [minimum, cut, dropped, remainder, floorWidths, ...modules] =
    canonical.split("|");
  if (!minimum || !cut || !dropped || !remainder || !floorWidths) {
    throw new Error("the 7D5 pre-width recording holds an incomplete plan");
  }
  const valueAfter = (part: string, prefix: string): string => {
    if (!part.startsWith(prefix)) {
      throw new Error(
        `the 7D5 pre-width recording expected ${prefix} in ${part}`,
      );
    }
    return part.slice(prefix.length);
  };
  const pair = (part: string, prefix: string): readonly [string, string] => {
    const pieces = valueAfter(part, prefix).split("/");
    if (pieces.length !== 2) {
      throw new Error(`the 7D5 pre-width recording holds an invalid ${prefix}`);
    }
    return [pieces[0] ?? "", pieces[1] ?? ""];
  };
  const [remainderA, remainderB] = pair(remainder, "remainder=");
  const [widthsA, widthsB] = pair(floorWidths, "floorWidths=");
  const widths = (value: string): readonly number[] =>
    value === "" ? [] : value.split(",").map(Number);
  return {
    minimumMet: valueAfter(minimum, "minimumMet=") === "true",
    cut: Number(valueAfter(cut, "cut=")),
    dropped: valueAfter(dropped, "dropped=").split(",").filter(Boolean),
    remainderMm: { A: Number(remainderA), B: Number(remainderB) },
    floorWidthsMm: { A: widths(widthsA), B: widths(widthsB) },
    bases: modules.map((module) => {
      const [id, role, buildId, wall, startMm, endMm, widthMm] =
        module.split("~");
      if (!id || !role || !buildId || (wall !== "A" && wall !== "B")) {
        throw new Error(
          `the 7D5 pre-width recording holds an invalid module: ${module}`,
        );
      }
      return {
        id,
        role,
        buildId,
        wall,
        startMm: Number(startMm),
        endMm: Number(endMm),
        widthMm: Number(widthMm),
      };
    }),
  };
}

export function readPreWidthRunRecording(): PreWidthRunRecording {
  const document = JSON.parse(
    readFileSync(RECORDING_FILE, "utf8"),
  ) as PreWidthRecordingDocument;
  const rooms = new Map(Object.entries(document.rooms));
  if (rooms.size !== document.runs) {
    throw new Error(
      `the 7D5 pre-width recording declares ${String(document.runs)} runs but holds ${String(rooms.size)} distinct rooms`,
    );
  }
  return {
    capturedFrom: document.capturedFrom,
    seed: document.seed,
    runs: document.runs,
    rooms,
  };
}
