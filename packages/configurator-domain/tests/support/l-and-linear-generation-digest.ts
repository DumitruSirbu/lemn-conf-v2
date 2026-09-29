// M7B U3a AC4 — one digest over what `generateKitchen` makes of a fixed set of L rooms (both corner
// directions, so the mirrored L is covered) and straight rooms, at three heights. The digest is taken
// by the caller's own `generateKitchen`, so the same function can be run against a pre-wave tree to
// record the value a later tree must reproduce byte for byte.
import { createHash } from "node:crypto";

interface DigestRoom {
  readonly shape: "L" | "linear";
  readonly widthMm: number;
  readonly depthMm: number;
  readonly heightMm: number;
  readonly cornerDirection?: "left" | "right";
}

export const DIGEST_OCCURRED_AT = "2026-09-29T12:00:00.000Z";

const HEIGHTS_MM = [2200, 2600, 3900] as const;
const L_WALL_A_MM = [
  1800, 2300, 2700, 3000, 3001, 3600, 4200, 4800, 5400, 6000,
] as const;
const L_WALL_B_MM = [
  1600, 2100, 2600, 3000, 3001, 3500, 4000, 4001, 5000, 6000,
] as const;
const LINEAR_WALL_A_MM = [
  1200, 1800, 2400, 2999, 3000, 3001, 3600, 4200, 4800, 5400, 6000,
] as const;
const CORNER_DIRECTIONS = [undefined, "left", "right"] as const;

/** Every room the digest covers, in a fixed order. */
export function digestRooms(): readonly DigestRoom[] {
  const rooms: DigestRoom[] = [];
  for (const heightMm of HEIGHTS_MM) {
    for (const widthMm of L_WALL_A_MM) {
      for (const depthMm of L_WALL_B_MM) {
        for (const cornerDirection of CORNER_DIRECTIONS) {
          rooms.push({
            shape: "L",
            widthMm,
            depthMm,
            heightMm,
            ...(cornerDirection === undefined ? {} : { cornerDirection }),
          });
        }
      }
    }
    for (const widthMm of LINEAR_WALL_A_MM) {
      rooms.push({ shape: "linear", widthMm, depthMm: 3400, heightMm });
    }
  }
  return rooms;
}

/** The sha-256 of every room's generation result — design and log, or the refusal — serialised in
 *  room order. A thrown error is recorded by its message, so a room that starts or stops throwing
 *  changes the digest too. */
export function digestGeneratedKitchens(
  generate: (room: DigestRoom) => unknown,
): string {
  const hash = createHash("sha256");
  for (const room of digestRooms()) {
    hash.update(JSON.stringify(room));
    hash.update(JSON.stringify(resultOrError(() => generate(room))));
  }
  return hash.digest("hex");
}

function resultOrError(run: () => unknown): unknown {
  try {
    return run();
  } catch (error) {
    return { thrown: error instanceof Error ? error.message : String(error) };
  }
}
