import {
  isLegacyEnumFinishName,
  LEGACY_ENUM_FINISHES,
  type Finish,
} from "@lemnaria/configurator-domain";
import type { CameraPresetId } from "@lemnaria/three-adapter";

/** The conditions of the M1 reference's preset shots. */
const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 640;
const DEFAULT_POSITION: [number, number, number] = [4.3, 2.9, 5.3];
const DEFAULT_TARGET: [number, number, number] = [1.5, 1.15, 0.9];

/**
 * Capture envelope, in CSS pixels. `scripts/capture-fidelity.mjs` never asks for more than the 960 x 640 stage box;
 * 1080p leaves room for a larger reference render without letting a crafted link request a drawing buffer the
 * browser cannot allocate. Unbounded values reach a CSS box and an R3F canvas on `frameloop="always"`: a client-side
 * denial of service (SEC-003).
 */
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;

/** One CSS pixel: below this there is no canvas to render into. */
const MIN_SIZE = 1;

export interface SceneShotRequest {
  width: number;
  height: number;
  position: [number, number, number];
  target: [number, number, number];
  finish: Finish;
  /** A camera preset by name, resolved against the room the stage holds. Present only when the query named one the
   *  editor offers; it then frames the shot and `pos` and `target` are not read. A preset the room does not offer
   *  (`wallC` in an L) frames the overview, as the editor's chip row does (`presetForRoom`). */
  view?: CameraPresetId;
}

/** Every preset id the editor's chip row can name, `wallC` a U's own. Spelled here, not derived: a query string is
 *  untrusted text and this is the whole of what it may pick. */
const PRESET_IDS: readonly CameraPresetId[] = [
  "overview",
  "wallA",
  "wallB",
  "wallC",
];

function parseView(raw: string | undefined): CameraPresetId | undefined {
  return PRESET_IDS.find((id) => id === raw);
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

/** The five names the M1 reference's preset shots are keyed by, read through the domain's legacy table rather than the
 *  panel's palette: the panel's chips changed and these names did not. An unrecognised name is the reference's own
 *  default, not a refusal, since a capture harness has nowhere to show an error.
 *
 *  What `oak` renders did change: `LEGACY_ENUM_FINISHES.oak` is `pal.stejar-bardolino`, drawn as `M.oak` tinted
 *  `#d8b483`, where the M1 reference drew it untinted. An `oak` capture is therefore darker and warmer than the
 *  reference; the other four are unchanged. */
function parseFinish(raw: string | undefined): Finish {
  return LEGACY_ENUM_FINISHES[isLegacyEnumFinishName(raw) ? raw : "white"];
}

export function parseSceneShotRequest(
  params: RawSearchParams,
): SceneShotRequest {
  const view = parseView(single(params, "view"));
  return {
    ...(view === undefined ? {} : { view }),
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
