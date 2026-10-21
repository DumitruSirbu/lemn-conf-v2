import { fc } from "@fast-check/vitest";
import {
  MAX_EXPORTED_KITCHENS,
  MAX_EXPORTED_NOTE_BYTES,
  MAX_EXPORTED_NOTES_IN_TOTAL,
  MAX_EXPORTED_NOTES_PER_KITCHEN,
} from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DRIVER_FAILURE_MARKER,
  EXPORT_POLICY_NAME,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  seedKitchen,
  seedSession,
  seedVerifiedAccount,
  type AccountWorld,
  type SeededAccount,
  type SeededSession,
} from "../../../support/account-world";

vi.mock("@/lib/server/account/account-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.accountStoreModule(),
  ),
);
vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/account/account-kitchen-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.accountKitchenStoreModule(),
  ),
);

const { POST } = await import("@/app/api/account/export/route");

/**
 * The staff notes in the client's own data export (M8B Lot 3, wave L3-S9; owner ruling O-L3-6, ADR 0174 decision 4):
 * each exported kitchen carries its notes as text and date, newest first, and never an author. The notes of a kitchen
 * the client deleted are not in the file, as the kitchen is not (ADR 0173: an open question, the coordinator's default).
 * A notes read that fails is a 503, never a download without them.
 */

const FIRST_INSTANT = Date.UTC(2026, 9, 1);
const ONE_MINUTE_MS = 60_000;
const STAFF_NAME = "Staff Author Name";
const STAFF_EMAIL = "staff-author@shop.example";

let world: AccountWorld;
let client: SeededAccount;
let session: SeededSession;
let staff: SeededAccount;

async function setUpTheCast(): Promise<void> {
  world = freshAccountWorld();
  captureConsole();
  client = await seedVerifiedAccount({
    email: "client@example.test",
    locale: "ro",
  });
  session = await seedSession(client);
  staff = await seedVerifiedAccount({
    email: STAFF_EMAIL,
    role: "operator",
  });
  await world.accounts.updateProfile({
    accountId: staff.id,
    changes: { name: STAFF_NAME },
  });
}

beforeEach(setUpTheCast);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

interface ExportedNote {
  readonly text: string;
  readonly createdAt: string;
}

interface ExportedKitchen {
  readonly id: string;
  readonly notes: readonly ExportedNote[];
  readonly notesTruncated: boolean;
}

function download() {
  return POST(
    accountRequest("/api/account/export", {
      method: "POST",
      json: {},
      cookie: session.cookie,
    }),
  );
}

async function kitchensOf(answer: Response): Promise<ExportedKitchen[]> {
  return ((await jsonOf(answer)) as { kitchens: ExportedKitchen[] }).kitchens;
}

function instantAt(minute: number): Date {
  return new Date(FIRST_INSTANT + minute * ONE_MINUTE_MS);
}

function writeNote(designId: string, text: string, minute: number): void {
  world.kitchens.seedNote({
    designId,
    text,
    createdAt: instantAt(minute),
    authorAccountId: staff.id,
  });
}

function writeNotes(designId: string, count: number): void {
  for (let minute = 0; minute < count; minute += 1) {
    writeNote(designId, `note ${String(minute)}`, minute);
  }
}

describe("the notes of a kitchen in the file", () => {
  it("are its text and date, newest first, and nothing else", async () => {
    const id = seedKitchen({ accountId: client.id });
    writeNote(id, "first call", 1);
    writeNote(id, "second call\nwith a second line", 2);

    const [kitchen] = await kitchensOf(await download());

    expect(kitchen).toMatchObject({
      id,
      notes: [
        {
          text: "second call\nwith a second line",
          createdAt: instantAt(2).toISOString(),
        },
        { text: "first call", createdAt: instantAt(1).toISOString() },
      ],
      notesTruncated: false,
    });
    expect(Object.keys(kitchen?.notes[0] ?? {}).sort()).toEqual([
      "createdAt",
      "text",
    ]);
  });

  it("are an empty list for a kitchen without a note, and for an account without a kitchen", async () => {
    const id = seedKitchen({ accountId: client.id });

    expect(await kitchensOf(await download())).toMatchObject([
      { id, notes: [], notesTruncated: false },
    ]);
  });

  it("include the notes of a hidden kitchen and leave out those of a kitchen the client deleted", async () => {
    const hidden = seedKitchen({
      accountId: client.id,
      sentAt: instantAt(0),
      hiddenAt: instantAt(1),
    });
    const deleted = seedKitchen({
      accountId: client.id,
      deletedAt: instantAt(1),
    });
    writeNote(hidden, "HIDDEN-KITCHEN-NOTE", 1);
    writeNote(deleted, "DELETED-KITCHEN-NOTE", 1);

    const answer = await download();
    const text = await answer.clone().text();

    expect(await kitchensOf(answer)).toMatchObject([
      { id: hidden, notes: [{ text: "HIDDEN-KITCHEN-NOTE" }] },
    ]);
    expect(text).not.toContain("DELETED-KITCHEN-NOTE");
  });

  it("carry no author: no staff id, e-mail or name appears anywhere in the file", async () => {
    const id = seedKitchen({ accountId: client.id });
    writeNote(id, "a note by a staff member", 1);

    const answer = await download();
    const text = await answer.clone().text();

    expect(text).toContain("a note by a staff member");
    for (const forbidden of [staff.id, STAFF_EMAIL, STAFF_NAME]) {
      expect(text).not.toContain(forbidden);
    }
    const [kitchen] = await kitchensOf(answer);
    expect(Object.keys(kitchen ?? {}).sort()).toEqual([
      "design",
      "id",
      "isHidden",
      "isSent",
      "name",
      "notes",
      "notesTruncated",
      "updatedAt",
    ]);
  });

  it("never include a note of another account's kitchen, over random ownership, hiding, deletion and note counts", async () => {
    const layout = fc.record({
      isMine: fc.boolean(),
      isHidden: fc.boolean(),
      isDeleted: fc.boolean(),
      noteCount: fc.integer({ min: 0, max: 3 }),
    });
    await fc.assert(
      fc.asyncProperty(fc.array(layout, { maxLength: 4 }), async (layouts) => {
        await setUpTheCast();
        const other = await seedVerifiedAccount({
          email: "other@example.test",
        });
        const expectedTexts = new Set<string>();
        for (const [index, kitchen] of layouts.entries()) {
          const id = seedKitchen({
            accountId: kitchen.isMine ? client.id : other.id,
            ...(kitchen.isHidden
              ? { sentAt: instantAt(0), hiddenAt: instantAt(1) }
              : {}),
            ...(kitchen.isDeleted ? { deletedAt: instantAt(1) } : {}),
          });
          const isExported = kitchen.isMine && !kitchen.isDeleted;
          const label = isExported ? "mine" : "FOREIGN-OR-DELETED";
          for (let note = 0; note < kitchen.noteCount; note += 1) {
            const text = `${label} kitchen ${String(index)} note ${String(note)}`;
            writeNote(id, text, note);
            if (isExported) expectedTexts.add(text);
          }
        }

        const exportedTexts = (await kitchensOf(await download())).flatMap(
          ({ notes }) => notes.map(({ text }) => text),
        );

        expect([...exportedTexts].sort()).toEqual([...expectedTexts].sort());
      }),
      { numRuns: 40 },
    );
  });
});

describe("the bound on the notes", () => {
  it("carries a kitchen's newest MAX_EXPORTED_NOTES_PER_KITCHEN notes and says the kitchen was cut", async () => {
    const id = seedKitchen({ accountId: client.id });
    writeNotes(id, MAX_EXPORTED_NOTES_PER_KITCHEN + 1);

    const [kitchen] = await kitchensOf(await download());

    expect(kitchen?.notes).toHaveLength(MAX_EXPORTED_NOTES_PER_KITCHEN);
    expect(kitchen?.notesTruncated).toBe(true);
    expect(kitchen?.notes.map(({ text }) => text)).not.toContain("note 0");
  });

  it("serves an account at the kitchen bound, each with notes past the whole-export bound, within both bounds", async () => {
    const perKitchen = Math.ceil(
      (MAX_EXPORTED_NOTES_IN_TOTAL + 1) / MAX_EXPORTED_KITCHENS,
    );
    for (let index = 0; index < MAX_EXPORTED_KITCHENS; index += 1) {
      writeNotes(seedKitchen({ accountId: client.id }), perKitchen);
    }

    const answer = await download();
    const kitchens = await kitchensOf(answer);

    expect(answer.status).toBe(200);
    expect(kitchens).toHaveLength(MAX_EXPORTED_KITCHENS);
    const carried = kitchens.reduce((sum, { notes }) => sum + notes.length, 0);
    expect(carried).toBe(MAX_EXPORTED_NOTES_IN_TOTAL);
    expect(kitchens.some(({ notesTruncated }) => notesTruncated)).toBe(true);
    for (const { notes } of kitchens) {
      expect(notes.length).toBeLessThanOrEqual(MAX_EXPORTED_NOTES_PER_KITCHEN);
    }
  });
});

describe("the size of the file when the notes are at their largest", () => {
  const FOUR_BYTE_CHARACTER = "\u{1F600}";
  const NOTE_JSON_OVERHEAD_BYTES = 64;
  const UTF8 = new TextEncoder();

  interface FileWithNotes {
    kitchens: { notes: { text: string }[] }[];
  }

  function seedMaximalNotes(text: string): void {
    for (let index = 0; index < MAX_EXPORTED_KITCHENS; index += 1) {
      const id = seedKitchen({ accountId: client.id });
      for (
        let minute = 0;
        minute < MAX_EXPORTED_NOTES_PER_KITCHEN;
        minute += 1
      ) {
        writeNote(id, text, minute);
      }
    }
  }

  /** The file's bytes, and what the file would weigh with every note taken out (the designs and the rest). */
  async function sizesOf(answer: Response) {
    const text = await answer.text();
    const file = JSON.parse(text) as FileWithNotes;
    const noteBytes = file.kitchens
      .flatMap(({ notes }) => notes)
      .reduce(
        (sum, { text: noteText }) => sum + UTF8.encode(noteText).length,
        0,
      );
    const withoutNotes = JSON.stringify({
      ...file,
      kitchens: file.kitchens.map((kitchen) => ({ ...kitchen, notes: [] })),
    });
    const noteCount = file.kitchens.reduce(
      (sum, { notes }) => sum + notes.length,
      0,
    );
    return {
      total: UTF8.encode(text).length,
      outsideNotes: UTF8.encode(withoutNotes).length,
      noteBytes,
      noteCount,
    };
  }

  it("is served with 200 kitchens of 100 four-byte-character notes of 2000 characters, the notes within the byte budget", async () => {
    seedMaximalNotes(FOUR_BYTE_CHARACTER.repeat(2000));

    const answer = await download();
    const sizes = await sizesOf(answer);

    expect(answer.status).toBe(200);
    expect(sizes.noteBytes).toBeLessThanOrEqual(MAX_EXPORTED_NOTE_BYTES);
    expect(sizes.noteBytes).toBe(
      Math.floor(MAX_EXPORTED_NOTE_BYTES / 8000) * 8000,
    );
    expect(sizes.total).toBeLessThanOrEqual(
      sizes.outsideNotes +
        MAX_EXPORTED_NOTE_BYTES +
        sizes.noteCount * NOTE_JSON_OVERHEAD_BYTES,
    );
  });

  it("is served with notes of nothing but line breaks, which JSON writes in two bytes each, within twice the budget and the per-note overhead", async () => {
    seedMaximalNotes("\n".repeat(2000));

    const answer = await download();
    const sizes = await sizesOf(answer);

    expect(answer.status).toBe(200);
    expect(sizes.noteBytes).toBeLessThanOrEqual(MAX_EXPORTED_NOTE_BYTES);
    expect(sizes.noteCount).toBeLessThanOrEqual(MAX_EXPORTED_NOTES_IN_TOTAL);
    expect(sizes.total).toBeLessThanOrEqual(
      sizes.outsideNotes +
        2 * MAX_EXPORTED_NOTE_BYTES +
        sizes.noteCount * NOTE_JSON_OVERHEAD_BYTES,
    );
  });

  it("marks every kitchen that lost a note to the byte budget as truncated, and none that lost nothing", async () => {
    seedMaximalNotes(FOUR_BYTE_CHARACTER.repeat(2000));

    const kitchens = await kitchensOf(await download());

    for (const kitchen of kitchens) {
      expect(kitchen.notesTruncated).toBe(
        kitchen.notes.length < MAX_EXPORTED_NOTES_PER_KITCHEN,
      );
    }
    expect(kitchens.some(({ notesTruncated }) => notesTruncated)).toBe(true);
  });
});

describe("a notes read that does not answer", () => {
  it("is a 503 with no file, and says nothing of the failure", async () => {
    const console_ = captureConsole();
    const id = seedKitchen({ accountId: client.id });
    writeNote(id, "NOTE-THAT-MUST-NOT-LEAK", 1);
    world.failOn("kitchens.exportNotes");

    const answer = await download();
    const text = await answer.clone().text();

    expect(answer.status).toBe(503);
    expect(answer.headers.get("content-disposition")).toBeNull();
    expect(text).not.toContain("formatVersion");
    expect(text).not.toContain("NOTE-THAT-MUST-NOT-LEAK");
    expect(text).not.toContain(DRIVER_FAILURE_MARKER);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(console_.accountLines()).not.toContainEqual({
      event: "export",
      outcome: "succeeded",
    });
  });

  it("is not logged as succeeded when the file cannot be built", async () => {
    const console_ = captureConsole();
    const id = seedKitchen({ accountId: client.id });
    world.kitchens.seedNote({
      designId: id,
      text: "a note with no date",
      createdAt: new Date(Number.NaN),
    });

    const answer = await download();

    expect(answer.status).toBe(503);
    expect(console_.accountLines()).not.toContainEqual({
      event: "export",
      outcome: "succeeded",
    });
  });

  it("is not read at all for an account over the kitchen bound", async () => {
    for (let index = 0; index <= MAX_EXPORTED_KITCHENS; index += 1) {
      seedKitchen({ accountId: client.id });
    }
    world.calls.length = 0;

    const answer = await download();

    expect(answer.status).toBe(409);
    expect(world.calls).not.toContain("kitchens.exportNotes");
  });

  it("is not read at all for an account that grew past the kitchen bound between the size and the read", async () => {
    for (let index = 0; index <= MAX_EXPORTED_KITCHENS; index += 1) {
      seedKitchen({ accountId: client.id });
    }
    world.intercept("kitchens.measureExport", () =>
      Promise.resolve({ kind: "within-bound" }),
    );
    world.calls.length = 0;

    const answer = await download();

    expect(answer.status).toBe(409);
    expect(world.calls).toContain("kitchens.exportAll");
    expect(world.calls).not.toContain("kitchens.exportNotes");
  });

  it("is not read at all for a day's bucket that is spent", async () => {
    seedKitchen({ accountId: client.id });
    limiterLedger.refusing.set(EXPORT_POLICY_NAME, 100);
    world.calls.length = 0;

    const answer = await download();

    expect(answer.status).toBe(429);
    expect(world.calls).not.toContain("kitchens.exportNotes");
  });

  it("is asked for the ids of the kitchens just read, and for no others", async () => {
    const mine = seedKitchen({ accountId: client.id });
    const deleted = seedKitchen({
      accountId: client.id,
      deletedAt: instantAt(1),
    });
    const spy = vi.spyOn(world.kitchens, "exportNotes");

    await download();

    expect(spy).toHaveBeenCalledWith(client.id, [mine]);
    expect(spy).not.toHaveBeenCalledWith(
      client.id,
      expect.arrayContaining([deleted]),
    );
  });
});
