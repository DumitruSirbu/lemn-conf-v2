"use client";

// A touch swipe on the Preview pop-up's slide. It listens and never calls `preventDefault`: the slide's
// `touch-action: pan-y` leaves the browser the vertical pan, and a pan the browser takes arrives here as
// `pointercancel`. The step is read from the net travel at release, so a drag that ends mostly vertical asks for nothing.
import {
  useRef,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { stepOfSwipe, type SlideStep } from "./slide-transition";

export type SlideSwipeHandlers = Pick<
  HTMLAttributes<HTMLElement>,
  "onPointerDown" | "onPointerUp" | "onPointerCancel"
>;

interface TouchStart {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
}

/** Only a primary touch swipes: a mouse drag selects and a pen draws, and a second finger is a pinch. */
function isSwipeCandidate(event: ReactPointerEvent<HTMLElement>): boolean {
  return event.pointerType === "touch" && event.isPrimary;
}

export function useSlideSwipe({
  isEnabled,
  onStep,
}: {
  readonly isEnabled: boolean;
  readonly onStep: (step: SlideStep) => void;
}): SlideSwipeHandlers {
  const touchStart = useRef<TouchStart | undefined>(undefined);

  return {
    onPointerDown: (event) => {
      touchStart.current =
        isEnabled && isSwipeCandidate(event)
          ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
          : undefined;
    },
    onPointerUp: (event) => {
      const start = touchStart.current;
      touchStart.current = undefined;
      if (!isEnabled || start?.pointerId !== event.pointerId) return;
      onStep(
        stepOfSwipe({
          deltaX: event.clientX - start.x,
          deltaY: event.clientY - start.y,
        }),
      );
    },
    onPointerCancel: () => {
      touchStart.current = undefined;
    },
  };
}
