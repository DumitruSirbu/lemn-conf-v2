// Test-only. The L and straight shells exactly as `buildKitchenShell` drew them at `30a4ea1`, the
// commit before M7B U4 slice S1: every child's geometry size, transform, visibility and paint.
//
// Captured by running the pre-change `buildKitchenShell` (the shell's only entry for these rooms) over
// the three rooms below and serialising each child with `describeStructure` plus the material's side,
// colour and map repeat. It is a recording of the old behaviour, not a re-derivation: wall C's plane
// must add nothing to, and change nothing in, a shell that is not a U (M7B criterion 7).
export interface RecordedShellChild {
  readonly name: string;
  readonly geometry: string;
  readonly size: readonly number[];
  readonly position: readonly number[];
  readonly rotation: readonly number[];
  readonly visible: boolean;
  readonly material: string;
  readonly side: number;
  readonly colour: number;
  readonly mapRepeat: readonly number[] | null;
}

/** Keyed by room: `L` and `linear` are 3700 x 3400 x 2600, `LOdd` is an L of 2313 x 4127 x 2401. */
export const SHELLS_AT_30A4EA1: Readonly<
  Record<"L" | "linear" | "LOdd", readonly RecordedShellChild[]>
> = {
  L: [
    {
      name: "floor",
      geometry: "BoxGeometry",
      size: [4, 0.03999999910593033, 3.700000047683716],
      position: [1.7, -0.02, 1.5499999999999998],
      rotation: [0, 0, 0],
      visible: true,
      material: "floor_oak",
      side: 0,
      colour: 16777215,
      mapRepeat: [3.8095238095238093, 4.352941176470588],
    },
    {
      name: "wall_back",
      geometry: "PlaneGeometry",
      size: [4, 2.5999999046325684, 0],
      position: [1.7, 1.3, 0],
      rotation: [0, 0, 0],
      visible: true,
      material: "wall_paint",
      side: 0,
      colour: 15263199,
      mapRepeat: null,
    },
    {
      name: "wall_left",
      geometry: "PlaneGeometry",
      size: [3.700000047683716, 2.5999999046325684, 0],
      position: [0, 1.3, 1.5499999999999998],
      rotation: [0, 1.5707963267948966, 0],
      visible: true,
      material: "wall_paint",
      side: 0,
      colour: 15263199,
      mapRepeat: null,
    },
    {
      name: "end_panel_right",
      geometry: "ExtrudeGeometry",
      size: [0.017999999225139618, 0.8199999928474426, 0.5999999940395355],
      position: [3.51, 0.41, 0.2900000023841858],
      rotation: [0, 0, 0],
      visible: true,
      material: "oak",
      side: 0,
      colour: 16777215,
      mapRepeat: [1, 1],
    },
    {
      name: "backsplash_wall_a",
      geometry: "BoxGeometry",
      size: [3.700000047683716, 0.5899999737739563, 0.014000000432133675],
      position: [1.85, 1.155, 0.037],
      rotation: [0, 0, 0],
      visible: true,
      material: "backsplash_tile",
      side: 0,
      colour: 16777215,
      mapRepeat: [6.342857142857143, 1],
    },
  ],
  linear: [
    {
      name: "floor",
      geometry: "BoxGeometry",
      size: [4, 0.03999999910593033, 3.700000047683716],
      position: [1.7, -0.02, 1.5499999999999998],
      rotation: [0, 0, 0],
      visible: true,
      material: "floor_oak",
      side: 0,
      colour: 16777215,
      mapRepeat: [3.8095238095238093, 4.352941176470588],
    },
    {
      name: "wall_back",
      geometry: "PlaneGeometry",
      size: [4, 2.5999999046325684, 0],
      position: [1.7, 1.3, 0],
      rotation: [0, 0, 0],
      visible: true,
      material: "wall_paint",
      side: 0,
      colour: 15263199,
      mapRepeat: null,
    },
    {
      name: "wall_left",
      geometry: "PlaneGeometry",
      size: [3.700000047683716, 2.5999999046325684, 0],
      position: [0, 1.3, 1.5499999999999998],
      rotation: [0, 1.5707963267948966, 0],
      visible: false,
      material: "wall_paint",
      side: 0,
      colour: 15263199,
      mapRepeat: null,
    },
    {
      name: "end_panel_right",
      geometry: "ExtrudeGeometry",
      size: [0.017999999225139618, 0.8199999928474426, 0.5999999940395355],
      position: [3.51, 0.41, 0.2900000023841858],
      rotation: [0, 0, 0],
      visible: true,
      material: "oak",
      side: 0,
      colour: 16777215,
      mapRepeat: [1, 1],
    },
    {
      name: "backsplash_wall_a",
      geometry: "BoxGeometry",
      size: [3.700000047683716, 0.5899999737739563, 0.014000000432133675],
      position: [1.85, 1.155, 0.037],
      rotation: [0, 0, 0],
      visible: true,
      material: "backsplash_tile",
      side: 0,
      colour: 16777215,
      mapRepeat: [6.342857142857143, 1],
    },
  ],
  LOdd: [
    {
      name: "floor",
      geometry: "BoxGeometry",
      size: [2.61299991607666, 0.03999999910593033, 4.427000045776367],
      position: [1.0065, -0.02, 1.9134999999999998],
      rotation: [0, 0, 0],
      visible: true,
      material: "floor_oak",
      side: 0,
      colour: 16777215,
      mapRepeat: [2.4885714285714284, 5.208235294117647],
    },
    {
      name: "wall_back",
      geometry: "PlaneGeometry",
      size: [2.61299991607666, 2.4010000228881836, 0],
      position: [1.0065, 1.2005, 0],
      rotation: [0, 0, 0],
      visible: true,
      material: "wall_paint",
      side: 0,
      colour: 15263199,
      mapRepeat: null,
    },
    {
      name: "wall_left",
      geometry: "PlaneGeometry",
      size: [4.427000045776367, 2.4010000228881836, 0],
      position: [0, 1.2005, 1.9134999999999998],
      rotation: [0, 1.5707963267948966, 0],
      visible: true,
      material: "wall_paint",
      side: 0,
      colour: 15263199,
      mapRepeat: null,
    },
    {
      name: "end_panel_right",
      geometry: "ExtrudeGeometry",
      size: [0.017999999225139618, 0.8199999928474426, 0.5999999940395355],
      position: [3.51, 0.41, 0.2900000023841858],
      rotation: [0, 0, 0],
      visible: true,
      material: "oak",
      side: 0,
      colour: 16777215,
      mapRepeat: [1, 1],
    },
    {
      name: "backsplash_wall_a",
      geometry: "BoxGeometry",
      size: [2.312999963760376, 0.5899999737739563, 0.014000000432133675],
      position: [1.1565, 1.155, 0.037],
      rotation: [0, 0, 0],
      visible: true,
      material: "backsplash_tile",
      side: 0,
      colour: 16777215,
      mapRepeat: [3.9651428571428573, 1],
    },
  ],
};
