/** A canvas source, so the probe can be exercised without a DOM. */
export type ProbeCanvasFactory = () => Pick<HTMLCanvasElement, "getContext">;

const browserCanvas: ProbeCanvasFactory = () =>
  document.createElement("canvas");

/**
 * Whether this browser can actually give us a WebGL context.
 *
 * The configurator has no non-3D path: when this returns false the customer gets the explicit
 * "3D required" exit, never a static stand-in for a configuration that does not exist.
 */
export function detectWebGLSupport(
  createCanvas: ProbeCanvasFactory = browserCanvas,
): boolean {
  try {
    const canvas = createCanvas();
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
