import { useEffect, useState } from "react";

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

/** `"probing"` until the browser has been asked, which is every server render and the first client one. */
export type WebGLSupportState = "probing" | "supported" | "unsupported";

/**
 * Whether this browser can give us WebGL, as the three states a screen draws: the loading line while it is not yet
 * known, the scene when it is, the editor's exit when it is not. The probe runs in an effect, never during render,
 * so the server and the hydration pass agree on `"probing"`.
 */
export function useWebGLSupport(): WebGLSupportState {
  const [support, setSupport] = useState<WebGLSupportState>("probing");

  useEffect(() => {
    setSupport(detectWebGLSupport() ? "supported" : "unsupported");
  }, []);

  return support;
}
