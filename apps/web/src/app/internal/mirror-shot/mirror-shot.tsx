"use client";

import type { CornerDirection } from "@lemnaria/configurator-domain";
import {
  applyCornerDirection,
  applyCornerDirectionToLightRig,
  CAMERA_FIELD_OF_VIEW_DEGREES,
  configureRenderer,
  createContactBlob,
  createLightRig,
  createShadowGround,
  createStudioEnvironment,
  disposeKit,
  makeKit,
  MAX_DEVICE_PIXEL_RATIO,
  RENDERER_PARAMETERS,
  seatObjectOnStage,
  STAGE_BACKGROUND,
  type Kit,
} from "@lemnaria/three-adapter";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/** 7I-A7/A18: the `base-corner` builder's own group — the base pair (X-leg + return leg) — is D4's
 *  "one group" example, drawn canonical and mirrored side by side so the primitive is visible on a
 *  real structural piece rather than only asserted in `corner-direction.test.ts`. */
const PANEL_WIDTH_PX = 480;
const PANEL_HEIGHT_PX = 480;

/** Frames to let settle after the camera lands, matching `scene-shot.tsx`'s own margin: the capture
 *  must never read a half-composited buffer. */
const FRAMES_BEFORE_READY = 5;

export interface MirrorShotProps {
  /** `"right"` is D4's mirror; `"left"` is a second canonical panel offered for a byte-for-byte
   *  sanity check that "left" really is a no-op (7I-A6), not only asserted in node. */
  readonly direction: CornerDirection;
}

/**
 * Internal verification surface, not a customer feature — the same stance as `/internal/scene-shot`
 * (SEC-003): `noindex`, nothing links to it, and the route is opt-in in production
 * (`route-availability.ts`, reused unchanged from that route).
 *
 * Two independent panels rather than one shared scene with two groups placed apart: each stands on
 * its own kit, its own light rig and its own auto-framed camera (`seatObjectOnStage`), so the
 * mirrored panel is never sharing a camera framed for the canonical one's (identical, but this way
 * the two panels owe nothing to each other's numbers).
 */
export function MirrorShot() {
  return (
    <div
      data-testid="mirror-shot"
      style={{
        display: "flex",
        flexDirection: "row",
        background: STAGE_BACKGROUND,
      }}
    >
      <CornerPanel direction="left" />
      <CornerPanel direction="right" />
    </div>
  );
}

function CornerPanel({ direction }: { readonly direction: CornerDirection }) {
  const [isReady, setReady] = useState(false);

  return (
    <div
      data-testid={`mirror-shot-${direction}`}
      data-ready={isReady ? "true" : "false"}
      style={{ width: PANEL_WIDTH_PX, height: PANEL_HEIGHT_PX }}
    >
      <Canvas
        frameloop="always"
        dpr={[1, MAX_DEVICE_PIXEL_RATIO]}
        gl={RENDERER_PARAMETERS}
        camera={{ fov: CAMERA_FIELD_OF_VIEW_DEGREES, near: 0.01, far: 500 }}
        onCreated={({ gl, scene }) => {
          configureRenderer(gl);
          const environment = createStudioEnvironment(gl);
          scene.environment = environment;
        }}
      >
        <CornerScene
          direction={direction}
          onReady={() => {
            setReady(true);
          }}
        />
      </Canvas>
    </div>
  );
}

interface CornerSceneProps {
  readonly direction: CornerDirection;
  readonly onReady: () => void;
}

/** Builds the kit and the one group once, mirrors it in place (D4) if asked, and frames the camera
 *  on it exactly as the editor frames a freshly generated kitchen (`seatObjectOnStage`). */
function CornerScene({ direction, onReady }: CornerSceneProps) {
  const camera = useThree((state) => state.camera);
  const hasFramed = useRef(false);
  const hasReadied = useRef(false);
  const remainingFrames = useRef(FRAMES_BEFORE_READY);

  const stage = useMemo(() => {
    const kit: Kit = makeKit({});
    const group = kit.builders["base-corner"]();
    const lights = createLightRig();
    if (direction === "right") {
      applyCornerDirection(group, "right");
      // QA 7I-Q3 (D6): the group mirrors, but nothing mirrored its light rig, so the right panel
      // was the left one's key/fill shining onto a group that had turned to face the other way.
      applyCornerDirectionToLightRig(lights, "right");
    }
    return {
      kit,
      group,
      lights,
      ground: createShadowGround(),
      blob: createContactBlob(),
    };
    // Built once per panel; `direction` is this panel's own prop and never changes after mount.
    // `react-hooks/exhaustive-deps` is not configured in this repository (`kitchen-stage.tsx`'s own
    // note), so there is no lint rule here to silence.
  }, []);

  useEffect(() => {
    return () => {
      disposeKit(stage.kit, stage.group);
    };
  }, [stage]);

  useFrame(() => {
    if (!hasFramed.current) {
      hasFramed.current = true;
      // No `OrbitControls` here to consume the returned target, unlike the editor's stage — so the
      // look-at this panel needs is applied directly, once, right after the auto-frame.
      const target = seatObjectOnStage({
        object: stage.group,
        camera: camera as THREE.PerspectiveCamera,
        ground: stage.ground,
        blob: stage.blob,
        key: stage.lights.key,
      });
      // D6's own rule, applied to this panel's fixed viewing direction rather than to a preset: the
      // auto-frame's `dir` is a constant offset (`stage.ts`'s `seatObjectOnStage`), so a right-hand
      // panel viewed from it looks at the piece's *back* — reflecting the camera's x about the
      // target is what puts the fronts on screen for both panels alike (Q7H-7's "does not pull
      // back" holds here too: only x moves, so the distance to target is unchanged).
      if (direction === "right") {
        camera.position.x = 2 * target.x - camera.position.x;
      }
      camera.lookAt(target);
      camera.updateMatrixWorld();
      return;
    }
    if (hasReadied.current) return;
    remainingFrames.current -= 1;
    if (remainingFrames.current <= 0) {
      hasReadied.current = true;
      onReady();
    }
  });

  return (
    <>
      <primitive object={stage.lights.hemisphere} />
      <primitive object={stage.lights.key} />
      <primitive object={stage.lights.fill} />
      <primitive object={stage.ground} />
      <primitive object={stage.blob} />
      <primitive object={stage.group} />
    </>
  );
}
