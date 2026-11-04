import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The price draft is ONE object in the e2e server's memory (the fake price book), not one per account, and every
// dashboard spec asserts exact pending counts on it. Playwright may run two spec files in two workers at once (the
// local run does; CI runs one worker to a shard), so a spec file that edits the draft holds this lock from `beforeAll`
// to `afterAll`: the files then take turns and no file sees another's pending price.
//
// The lock is a directory, made atomically, named for the port of the server whose draft it guards. It holds the
// holder's process id, and a lock whose holder is gone, or that is older than any file takes, is taken over, so a killed
// run does not stop the next one.

const POLL_MS = 250;
const NO_FILE_TAKES_THIS_LONG_MS = 10 * 60 * 1000;
const OWNER_FILE = "owner.json";

const lockDirectory = join(
  tmpdir(),
  `lemnaria-e2e-price-draft-${process.env.E2E_PORT ?? "4320"}.lock`,
);

export async function holdPriceDraft(): Promise<void> {
  for (;;) {
    if (tryToTakeLock()) return;
    if (isHolderGone()) rmSync(lockDirectory, { recursive: true, force: true });
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/** Gives the lock back if this process holds it; a file whose wait never ended does not release another's. */
export function releasePriceDraft(): void {
  if (ownerPid() === process.pid) {
    rmSync(lockDirectory, { recursive: true, force: true });
  }
}

function tryToTakeLock(): boolean {
  try {
    mkdirSync(lockDirectory);
  } catch {
    return false;
  }
  writeFileSync(
    join(lockDirectory, OWNER_FILE),
    JSON.stringify({ pid: process.pid, takenAt: Date.now() }),
  );
  return true;
}

function isHolderGone(): boolean {
  const owner = readOwner();
  // No owner file yet: the holder is between the two lines of `tryToTakeLock`.
  if (owner === undefined) return false;
  return (
    Date.now() - owner.takenAt > NO_FILE_TAKES_THIS_LONG_MS ||
    !isProcessAlive(owner.pid)
  );
}

function ownerPid(): number | undefined {
  return readOwner()?.pid;
}

function readOwner(): { pid: number; takenAt: number } | undefined {
  try {
    return JSON.parse(
      readFileSync(join(lockDirectory, OWNER_FILE), "utf8"),
    ) as { pid: number; takenAt: number };
  } catch {
    return undefined;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
