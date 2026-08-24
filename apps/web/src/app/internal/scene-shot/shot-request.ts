import type { FinishKey } from "@lemnaria/three-adapter";

/** The conditions `design-source/Modern Kitchen Cabinets 3D (3)/preset-shots.html` pinned. */
const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 640;
const DEFAULT_POSITION: [number, number, number] = [4.3, 2.9, 5.3];
const DEFAULT_TARGET: [number, number, number] = [1.5, 1.15, 0.9];

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

function parseSize(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function parseFinish(raw: string | undefined): FinishKey {
  return FINISH_KEYS.find((key) => key === raw) ?? "white";
}

export function parseSceneShotRequest(
  params: RawSearchParams,
): SceneShotRequest {
  return {
    width: parseSize(single(params, "w"), DEFAULT_WIDTH),
    height: parseSize(single(params, "h"), DEFAULT_HEIGHT),
    position: parseVector(single(params, "pos"), DEFAULT_POSITION),
    target: parseVector(single(params, "target"), DEFAULT_TARGET),
    finish: parseFinish(single(params, "finish")),
  };
}
