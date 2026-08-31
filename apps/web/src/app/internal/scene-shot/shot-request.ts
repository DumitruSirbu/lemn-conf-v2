import type { FinishKey } from "@lemnaria/three-adapter";

/** The conditions `design-source/Modern Kitchen Cabinets 3D (3)/preset-shots.html` pinned. */
const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 640;
const DEFAULT_POSITION: [number, number, number] = [4.3, 2.9, 5.3];
const DEFAULT_TARGET: [number, number, number] = [1.5, 1.15, 0.9];

/**
 * Capture envelope, in CSS pixels. The only caller that drives this route is
 * `scripts/capture-fidelity.mjs`, which never asks for more than the 960 x 640 stage box
 * (`scripts/fidelity-shots.mjs`); the envelope is set at 1080p so a larger reference render stays
 * possible without letting a crafted link ask the browser for a drawing buffer it cannot allocate.
 * Unbounded values reach a CSS box and an R3F canvas rendering with `frameloop="always"`, which is
 * a client-side denial of service (SEC-003).
 */
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;

/** One CSS pixel: below this there is no canvas to render into. */
const MIN_SIZE = 1;

const FINISH_KEYS: readonly FinishKey[] = [
  "white",
  "clay",
  "sage",
  "graphite",
  "oak",
];

export interface SceneShotRequest {
  width: number;
  height: number;
  position: [number, number, number];
  target: [number, number, number];
  finish: FinishKey;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function single(params: RawSearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseVector(
  raw: string | undefined,
  fallback: [number, number, number],
): [number, number, number] {
  if (!raw) return fallback;
  const [x, y, z, ...extra] = raw.split(",").map((part) => Number(part.trim()));
  if (extra.length > 0) return fallback;
  if (x === undefined || y === undefined || z === undefined) return fallback;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z))
    return fallback;
  return [x, y, z];
}

function parseSize(
  raw: string | undefined,
  { fallback, maximum }: { fallback: number; maximum: number },
): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < MIN_SIZE) return fallback;
  return Math.min(Math.round(value), maximum);
}

function parseFinish(raw: string | undefined): FinishKey {
  return FINISH_KEYS.find((key) => key === raw) ?? "white";
}

export function parseSceneShotRequest(
  params: RawSearchParams,
): SceneShotRequest {
  return {
    width: parseSize(single(params, "w"), {
      fallback: DEFAULT_WIDTH,
      maximum: MAX_WIDTH,
    }),
    height: parseSize(single(params, "h"), {
      fallback: DEFAULT_HEIGHT,
      maximum: MAX_HEIGHT,
    }),
    position: parseVector(single(params, "pos"), DEFAULT_POSITION),
    target: parseVector(single(params, "target"), DEFAULT_TARGET),
    finish: parseFinish(single(params, "finish")),
  };
}
