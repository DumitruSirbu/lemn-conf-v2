// The preset's thumbnail (ADR 0112 Amendment A decision 6): one frame of the editor's own scene, at one size, encoded to
// fit the route's cap. The editor's canvas is drawn by a component inside it (`scene-capture-registration.ts`) and
// reached from outside through this module's registry, because the dialog that asks for the image is not part of the
// canvas's tree.
import {
  isPresetThumbnailType,
  MAX_PRESET_THUMBNAIL_BYTES,
  type PresetThumbnailType,
} from "@lemnaria/configurator-domain";

/** What the route's body carries: the type the bytes really are, and the bytes as plain base64 with no `data:` prefix. */
export interface EncodedPresetImage {
  readonly imageType: PresetThumbnailType;
  readonly base64: string;
}

/** Draws the overview frame at the capture size and answers it as a canvas of its own, so the live canvas is back to
 *  what the customer sees before anything is encoded. */
export type SceneSnapshotter = () => HTMLCanvasElement;

export class SceneCaptureUnavailableError extends Error {
  constructor(reason: string) {
    super(`The scene cannot be captured: ${reason}`);
    this.name = "SceneCaptureUnavailableError";
  }
}

let snapshotter: SceneSnapshotter | null = null;

/** Registered by the mounted editor canvas and withdrawn when it unmounts. Returns the withdrawal. */
export function registerSceneSnapshotter(next: SceneSnapshotter): () => void {
  snapshotter = next;
  return () => {
    if (snapshotter === next) snapshotter = null;
  };
}

/**
 * The editor's scene as it would be shown on a card: the overview camera, no selection or void outlines, at exactly
 * the capture size (`PRESET_THUMBNAIL_WIDTH_PX` by `PRESET_THUMBNAIL_HEIGHT_PX`). WebP when the browser encodes it within the cap, else PNG within the cap, else JPEG at falling quality;
 * the size never changes (the route refuses any other).
 */
export async function captureSceneImage(): Promise<EncodedPresetImage> {
  if (snapshotter === null) throw new SceneCaptureUnavailableError("no scene");
  const frame = snapshotter();
  const blob = await encodeWithinCap(frame);
  return { imageType: imageTypeOf(blob), base64: await base64Of(blob) };
}

const WEBP_QUALITY = 0.9;
const JPEG_QUALITIES: readonly number[] = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];

async function encodeWithinCap(frame: HTMLCanvasElement): Promise<Blob> {
  // A browser that cannot encode WebP answers PNG for this request (Safari does), so the answer's own type is read.
  const webpAsked = await encode(frame, "image/webp", WEBP_QUALITY);
  if (fitsTheCap(webpAsked)) return webpAsked;
  const png =
    webpAsked.type === "image/png"
      ? webpAsked
      : await encode(frame, "image/png");
  if (fitsTheCap(png)) return png;
  return encodeJpegWithinCap(frame);
}

async function encodeJpegWithinCap(frame: HTMLCanvasElement): Promise<Blob> {
  for (const quality of JPEG_QUALITIES) {
    const jpeg = await encode(frame, "image/jpeg", quality);
    if (fitsTheCap(jpeg)) return jpeg;
  }
  throw new SceneCaptureUnavailableError("the image does not fit the cap");
}

function fitsTheCap(blob: Blob): boolean {
  return (
    isPresetThumbnailType(blob.type) && blob.size <= MAX_PRESET_THUMBNAIL_BYTES
  );
}

function encode(
  frame: HTMLCanvasElement,
  type: PresetThumbnailType,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    frame.toBlob(
      (blob) => {
        if (blob === null) reject(new SceneCaptureUnavailableError("encode"));
        else resolve(blob);
      },
      type,
      quality,
    );
  });
}

function imageTypeOf(blob: Blob): PresetThumbnailType {
  if (!isPresetThumbnailType(blob.type)) {
    throw new SceneCaptureUnavailableError("the encoded type");
  }
  return blob.type;
}

const BASE64_CHUNK_BYTES = 0x8000;

async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let at = 0; at < bytes.length; at += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(
      ...bytes.subarray(at, at + BASE64_CHUNK_BYTES),
    );
  }
  return btoa(binary);
}
