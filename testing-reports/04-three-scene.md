# Three.js scene and lifecycle

## FINDING: Deleted seeded bodies return as unselectable reference ghosts

- **ID:** SCENE-001
- **SEVERITY:** Critical
- **THE EXPLOIT/FLAW:** `KitchenStage` builds the complete seeded `kitchen-l` reference scene and tries
  to turn it into a shell by removing children whose positions match the **currently loaded**
  placement records (`apps/web/src/scene/kitchen-stage.tsx:92-137`). A body deleted before persistence
  has no current record, so its reference child is never removed. `syncSolidBodies` only owns/tagged
  current placements; the leftover reference object has no `placementId`, cannot be selected or
  deleted, and disagrees with the persisted design, domain voids, and future pricing.

  A headless reproduction removed placement `p7` (`fridge-free-700`) from the persisted design and
  executed the stage decomposition. It removed 25 current bodies but left:

  ```json
  {
    "deletedBuildId": "fridge-free-700",
    "removedByCurrentRecords": 25,
    "leftoverNamed": [
      "floor",
      "wall_back",
      "wall_left",
      "induction_cooktop",
      "end_panel_right",
      "fridge_freestanding",
      "backsplash_wall_a"
    ]
  }
  ```

  `fridge_freestanding` is the deleted body. The current decomposition-parity suite proves a bijection
  only against the full seeded record set, so it cannot catch deletion before initial mount. This
  violates `DEVELOPMENT-SPEC.md` §5.1 (remove), §6.1 (selectability), and §10's signature flow.

- **REMEDIATION:** Make shell construction independent of customer state. The adapter should expose a
  tested `buildKitchenShell()` that removes **all** canonical reference placements using the full
  decomposition manifest, or construct the floor/walls/backsplash/end panel directly. The app must
  never infer what belongs to the immutable shell from the loaded design. Add a parameterized test
  that removes each deletable seeded placement before the first stage mount and asserts:
  - no reference child for the deleted body remains;
  - every mounted solid has exactly one `placementId` from the design;
  - child count and scene signatures match the persisted placement set;
  - reload does not change visibility or pickability.

## FINDING: Imperative primitive resources leak across scene unmounts

- **ID:** SCENE-002
- **SEVERITY:** Medium
- **THE EXPLOIT/FLAW:** The stage creates a kit, full room, lights, ground, contact blob, materials,
  geometries, and canvas textures in a mount-lifetime `useMemo`
  (`apps/web/src/scene/kitchen-stage.tsx:92-137`) and supplies them through `<primitive>`
  (`apps/web/src/scene/kitchen-stage.tsx:296-304`). Cleanup disposes only the studio environment
  (`apps/web/src/scene/kitchen-stage.tsx:160-169`). The active selection-outline effect disposes the
  previous outline on dependency change but returns no unmount cleanup
  (`apps/web/src/scene/kitchen-stage.tsx:237-255`). React Three Fiber 9.7's installed reconciler
  explicitly says it never disposes primitives and skips disposal when `instance.type === 'primitive'`
  (`apps/web/node_modules/@react-three/fiber/dist/events-156d8d12.esm.js:15231-15237,15292`).
  Repeated client-side mounts can therefore retain GPU buffers,
  materials, and textures until context/browser teardown.
- **REMEDIATION:** Give the adapter one ownership-aware `disposeKitAndStage(stage)` operation that
  disposes every kit-owned shared geometry/material/texture exactly once, plus non-kit room, void,
  ground, blob, and light resources. Call it from a `useEffect(() => () => ..., [stage])` cleanup.
  Return cleanup from the outline effect for the currently mounted outline. Add an unmount/remount
  test with disposal spies and a browser stress gate that checks `renderer.info.memory` returns to its
  baseline after repeated mounts.
