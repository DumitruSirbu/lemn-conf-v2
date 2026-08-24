import * as THREE from "three";

/** `instanceof` narrowed to the default `Mesh` shape, so callers get concrete geometry/material
 *  types instead of the `any`-parameterised one three.js's own class declaration exposes. */
export function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return object instanceof THREE.Mesh;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Cannot bake a procedural texture: no 2D canvas context");
  return context;
}
