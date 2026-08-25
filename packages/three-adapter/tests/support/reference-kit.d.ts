/**
 * The unmodified reference geometry library, aliased in `vitest.config.ts` to
 * `design-source/Modern Kitchen Cabinets 3D (3)/kitchen-parts.js`.
 *
 * Test scaffolding only: the structural-parity suite builds every part from both the reference and
 * the port and diffs them, which is stronger evidence of a faithful port than hand-transcribed
 * expectations. Nothing in `src/index.ts` reaches for this, so `design-source` stays reference
 * material rather than a runtime dependency.
 *
 * Typed loosely on purpose — the suite compares built trees, and pinning the reference to the
 * port's own types would let a type-level drift hide the very difference it is looking for.
 */
declare module "@reference/kitchen-parts" {
  import type { Group, Object3D } from "three";

  export interface ReferenceKit {
    builders: Record<string, (...args: number[]) => Group>;
    M: Record<string, { readonly name: string }>;
    make: {
      baseCabinet: (w: number, opts?: Record<string, unknown>) => Group;
      wallCabinet: (
        W: number,
        doors: number,
        H?: number,
        D?: number,
        pushOpen?: boolean,
      ) => Group;
      openShelf: (W?: number, D?: number, inner?: number, H?: number) => Group;
      hood: (w?: number, chimneyH?: number) => Group;
      cornerBaseX: () => Group;
      cornerBaseReturn: (LD?: number) => Group;
      dishwasherHousing: (W?: number) => Group;
    };
  }

  export function makeKit(three: unknown): ReferenceKit;

  export type { Object3D };
}
