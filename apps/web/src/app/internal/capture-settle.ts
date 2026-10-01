// Review C1.2: `mirror-shot.tsx` and `scene-shot.tsx` each waited out their own copy of this
// number before signalling ready — one shared margin for both capture routes, so a future change to
// how long a buffer takes to settle cannot correct one and silently miss the other.

/** Frames to let settle after the camera lands, so a capture never reads a half-composited buffer. */
export const FRAMES_BEFORE_READY = 5;
