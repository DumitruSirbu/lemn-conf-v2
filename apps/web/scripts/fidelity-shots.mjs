// The shot list shared by the M1 fidelity capture scripts, so the port and the reference rig are
// always photographed from identical cameras.
//
// The four preset shots are the conditions `preset-shots.html` pinned and the reference PNGs in
// `shots/presets/` were taken under. The detail shots frame the features the milestone calls out by
// name; the reference never recorded the cameras behind its own `shots/handles.png` and friends, so
// these are chosen here — which costs nothing, because the reference rig is re-shot at the same
// cameras rather than compared against the shipped images.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export const STAGE_WIDTH = 960;
export const STAGE_HEIGHT = 640;

/** The reference PNGs are 924 x 540 crops of the rig's 960 x 640 stage box. */
export const REFERENCE_WIDTH = 924;
export const REFERENCE_HEIGHT = 540;

export const PRESET_SHOTS = [
  {
    name: "01-white",
    shippedReference: "shots/presets/01-p.png",
    finish: "white",
    pos: [4.3, 2.9, 5.3],
    target: [1.5, 1.15, 0.9],
  },
  {
    name: "02-clay",
    shippedReference: "shots/presets/02-p.png",
    finish: "clay",
    pos: [2.9, 2.5, 5.9],
    target: [1.4, 1.1, 0.8],
  },
  {
    name: "03-sage",
    shippedReference: "shots/presets/03-p.png",
    finish: "sage",
    pos: [5.5, 3.2, 4.4],
    target: [1.6, 1.15, 0.9],
  },
  {
    name: "04-oak",
    shippedReference: "shots/presets/04-p.png",
    finish: "oak",
    pos: [3.9, 2.7, 5.6],
    target: [1.5, 1.1, 0.9],
  },
];

export const DETAIL_SHOTS = [
  {
    name: "detail-front-run",
    shows:
      "Wall A head-on: handle placement down the whole run and the ceiling row above it.",
    shippedReference:
      "shots/handles.png, shots/top-handles.png, shots/push-open-top.png",
    finish: "white",
    pos: [1.75, 1.45, 4.95],
    target: [1.75, 1.3, 0.3],
  },
  {
    name: "detail-handles-closeup",
    shows:
      "Bar proportion and inset on drawers, doors and the dishwasher panel.",
    shippedReference: "shots/handles.png",
    finish: "white",
    pos: [2.15, 1.3, 2.05],
    target: [1.9, 0.95, 0.32],
  },
  {
    name: "detail-ceiling-row-closeup",
    shows: "The 2.20-2.60 row: push-to-open, handles built but hidden.",
    shippedReference: "shots/push-open-top.png, shots/top-handles.png",
    finish: "white",
    pos: [1.95, 2.15, 2.35],
    target: [1.7, 2.4, 0.3],
  },
  {
    name: "detail-flush-wall",
    shows:
      "Wall seating at the corner and along wall B — no body floating off its wall plane.",
    shippedReference: "shots/flush-wall.png",
    finish: "white",
    pos: [4.6, 1.75, 4.2],
    target: [0.9, 1.25, 1.1],
  },
  {
    name: "detail-material-lighting",
    shows:
      "Overall material and lighting character under the preset-01 conditions.",
    shippedReference: "shots/real.png",
    finish: "white",
    pos: [4.3, 2.9, 5.3],
    target: [1.5, 1.15, 0.9],
  },
];

export const ALL_SHOTS = [...PRESET_SHOTS, ...DETAIL_SHOTS];

/** Repo-relative and gitignored (`.tmp/`) so the default resolves the same way on any machine. */
export const OUTPUT_DIRECTORY = resolve(appRoot, ".tmp/fidelity");
