// One tab, two designs and one server, driven event by event under a fake clock: the app's own session store and its
// one writer, with only `fetch` replaced by a server that keeps every revision it has stored. The probe is played by
// hand, as `useWriteAccessProbe` plays it: one question per load, answered with the copy the server holds when it
// answers, applied when it arrives unless the editor that asked has gone.
//
// After every event the tab is checked against what the server holds. No assertion library is used here: a broken
// rule is a sentence in `violations`, so the caller decides how to report it.
import { vi } from "vitest";

export type DesignName = "design-a" | "design-b";

export type SaveAnswer = "stored" | "failed" | "limited-1s" | "limited-30s";

/** What the server does with a save when it arrives: answer it at once, or keep it out until an `answer` event. */
export type SaveMode = SaveAnswer | "held";

export type TabEvent =
  | { readonly kind: "edit" }
  | { readonly kind: "pass"; readonly ms: number }
  /** The server decides the save that is out; its answer is still on its way to the tab. */
  | { readonly kind: "server-decides"; readonly with: SaveAnswer }
  /** The answer reaches the tab: the one already decided, or one decided now as `with`. */
  | { readonly kind: "answer"; readonly with: SaveAnswer }
  | { readonly kind: "go"; readonly to: DesignName; readonly keptPage: number }
  | { readonly kind: "probe-answered" }
  | { readonly kind: "probe-arrives" }
  | { readonly kind: "probe-fails" }
  | { readonly kind: "probe-retried" };

const FIRST_REVISION = 1;
/** Every tab starts at the same instant, so two runs of the same events can be compared to the millisecond. */
const CLOCK_STARTS_AT_MS = Date.UTC(2026, 9, 12, 9, 0, 0);
const MIN_SAVE_INTERVAL_MS = 1000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 8000;
const SECOND_MS = 1000;
const SERVER_ERROR_STATUS = 500;
const CONFLICT_STATUS = 409;
const LIMIT_STATUS = 429;
/** Longer than the longest wait a save can be told (30 s) and the backoff's largest step (8 s), several times over. */
const REST_MS = 120_000;
const MICROTASK_ROUNDS = 8;

type SessionStore = Awaited<ReturnType<typeof importSessionStore>>;
type Design = ReturnType<SessionStore["getState"]>["design"];

async function importSessionStore() {
  vi.resetModules();
  const module = await import("../../src/store/configurator-store");
  return module.useConfiguratorStore;
}

interface StoredRevision {
  readonly revision: string;
  readonly design: Design;
}

interface OutstandingSave {
  readonly designId: DesignName;
  readonly expectedRevision: string | null;
  readonly body: string;
  readonly respond: (response: Response) => void;
  /** The server's answer once it has decided, until it reaches the tab. */
  decided: Response | null;
}

interface Probe {
  readonly designId: DesignName;
  copy: StoredRevision | null;
}

function json(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function placementIdsOf(design: Design): readonly string[] {
  return design.placements.map(({ id }) => id);
}

function clone(design: Design): Design {
  return JSON.parse(JSON.stringify(design)) as Design;
}

function limitSecondsOf(answer: SaveAnswer): number {
  return answer === "limited-30s" ? 30 : 1;
}

/** The tab, the server and the record of what each has done. */
export class OneTabTwoDesigns {
  readonly violations: string[] = [];
  /** Every revision the server has stored of each design, oldest first: the pages a router could have kept. */
  private readonly history = new Map<DesignName, StoredRevision[]>();
  private readonly editsMade = new Map<DesignName, string[]>();
  private readonly knownRevisions = new Map<DesignName, Set<string>>();
  private readonly failuresInARow = new Map<DesignName, number>();
  private readonly notBeforeMs = new Map<DesignName, number>();
  private readonly savesSent = new Map<DesignName, number>();
  private readonly savesNotStored = new Map<DesignName, number>();
  private readonly modes: SaveMode[];
  private outstanding: OutstandingSave | null = null;
  private lastStoredAtMs: number | null = null;
  private probe: Probe | null = null;
  private onScreen: DesignName = "design-a";

  private constructor(
    private readonly store: SessionStore,
    modes: readonly SaveMode[],
  ) {
    this.modes = [...modes];
  }

  /** A fresh tab under a fake clock with design A loaded and its probe asked; `modes` are the next saves' fates. */
  static async open(modes: readonly SaveMode[]): Promise<OneTabTwoDesigns> {
    vi.useFakeTimers({ now: CLOCK_STARTS_AT_MS });
    const store = await importSessionStore();
    const tab = new OneTabTwoDesigns(store, modes);
    const first = store.getState().design;
    for (const name of ["design-a", "design-b"] as const) {
      tab.history.set(name, [
        { revision: String(FIRST_REVISION), design: clone(first) },
      ]);
      tab.editsMade.set(name, []);
      tab.knownRevisions.set(name, new Set());
    }
    vi.stubGlobal("fetch", (url: string, init: RequestInit) =>
      tab.receiveSave(url, init),
    );
    // Between two store writes as well as after an event: an edit offered for one write is an edit offered.
    store.subscribe(() => {
      for (const sentence of tab.cleanAndWritableIsTheStoredCopy())
        tab.violations.push(`in a store write: ${sentence}`);
    });
    tab.load("design-a", 0);
    return tab;
  }

  static close(): void {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }

  get state() {
    return this.store.getState();
  }

  /** What the customer can see of the design and its save, for comparing two runs. */
  get shown() {
    const { design, revision, saveStatus, saveResumesAtMs, hasBeenEdited } =
      this.state;
    return {
      placements: placementIdsOf(design),
      revision,
      saveStatus,
      saveResumesAtMs,
      hasBeenEdited,
      isUnsaved: design !== this.state.savedDesign,
    };
  }

  get hasSaveOut(): boolean {
    return this.outstanding !== null;
  }

  async play(events: readonly TabEvent[]): Promise<void> {
    for (const event of events) {
      await this.apply(event);
      await this.settle();
      this.check(event.kind);
      if (this.violations.length > 0) return;
    }
  }

  /**
   * Lets everything the tab owes happen: the save that is out is stored, later saves are stored, time passes beyond
   * every wait, and the probe is answered. Then nothing may be left unsent, armed or unsaved.
   */
  async comeToRest(): Promise<void> {
    this.modes.length = 0;
    for (let round = 0; round < 3; round += 1) {
      this.answerOutstanding("stored");
      await this.settle();
      await vi.advanceTimersByTimeAsync(REST_MS);
      await this.settle();
    }
    this.retryProbe();
    this.answerProbe();
    this.deliverProbe();
    await this.settle();
    this.check("rest");
    this.checkAtRest();
  }

  private async apply(event: TabEvent): Promise<void> {
    switch (event.kind) {
      case "edit":
        this.edit();
        return;
      case "pass":
        await vi.advanceTimersByTimeAsync(event.ms);
        return;
      case "server-decides":
        this.decideOutstanding(event.with);
        return;
      case "answer":
        this.answerOutstanding(event.with);
        return;
      case "go":
        this.load(event.to, event.keptPage);
        return;
      case "probe-answered":
        this.answerProbe();
        return;
      case "probe-arrives":
        this.deliverProbe();
        return;
      case "probe-fails":
        this.failProbe();
        return;
      case "probe-retried":
        this.retryProbe();
        return;
    }
  }

  private async settle(): Promise<void> {
    for (let round = 0; round < MICROTASK_ROUNDS; round += 1) {
      await vi.advanceTimersByTimeAsync(0);
    }
  }

  /** The editor of `to` mounting from a page the router kept: any revision the server has held, up to the stored. */
  private load(to: DesignName, keptPage: number): void {
    if (this.state.designId === to) return;
    const pages = this.historyOf(to);
    const page = pages[keptPage % pages.length];
    if (page === undefined) throw new Error("no page was ever stored");
    this.onScreen = to;
    this.knownRevisionsOf(to).add(page.revision);
    this.state.hydrate({
      designId: to,
      design: clone(page.design),
      revision: page.revision,
      canWrite: "checking",
    });
    this.probe = { designId: to, copy: null };
  }

  /** One edit, offered only where the editor offers one: write access answered `true`. */
  private edit(): void {
    if (this.state.canWrite !== true) return;
    const removable = this.state.records.find((record) => record.canDelete);
    if (removable === undefined) return;
    const before = this.state.design;
    this.state.select({ kind: "placement", id: removable.id });
    this.state.remove();
    if (this.state.design === before) return;
    this.editsOf(this.onScreen).push(removable.id);
  }

  private answerProbe(): void {
    if (this.probe === null || this.probe.copy !== null) return;
    this.probe.copy = this.storedCopyOf(this.probe.designId);
  }

  private deliverProbe(): void {
    const probe = this.probe;
    if (!probe?.copy) return;
    this.probe = null;
    const { design, revision } = probe.copy;
    const before = this.state;
    const isOwedTheCopy =
      before.design === before.savedDesign &&
      Number(revision) > Number(before.revision);
    this.state.applyWriteAccess({
      designId: probe.designId,
      canWrite: true,
      stored: { design: clone(design), revision },
    });
    const tookTheCopy = this.state.design !== before.design;
    if (tookTheCopy) this.knownRevisionsOf(probe.designId).add(revision);
    if (tookTheCopy !== isOwedTheCopy)
      this.violations.push(
        `the answer at revision ${revision} ${tookTheCopy ? "replaced" : "did not replace"} a copy at revision ${String(before.revision)} that was ${before.design === before.savedDesign ? "clean" : "unsaved"}`,
      );
  }

  private failProbe(): void {
    if (this.probe === null) return;
    const { designId } = this.probe;
    this.probe = null;
    this.state.failWriteAccessCheck({ designId });
  }

  private retryProbe(): void {
    if (this.state.canWrite !== "check-failed") return;
    this.state.retryWriteAccessCheck();
    this.probe = { designId: this.onScreen, copy: null };
  }

  private receiveSave(url: string, init: RequestInit): Promise<Response> {
    const designId = (url.split("/").at(-1) ?? "") as DesignName;
    const expectedRevision = new Headers(init.headers).get(
      "x-expected-revision",
    );
    this.checkSaveMaySendNow(designId, expectedRevision);
    this.savesSent.set(designId, (this.savesSent.get(designId) ?? 0) + 1);
    const mode = this.modes.shift() ?? "stored";
    return new Promise<Response>((respond) => {
      this.outstanding = {
        designId,
        expectedRevision,
        body: typeof init.body === "string" ? init.body : "",
        respond,
        decided: null,
      };
      if (mode !== "held") this.answerOutstanding(mode);
    });
  }

  private checkSaveMaySendNow(
    designId: DesignName,
    expectedRevision: string | null,
  ): void {
    const now = Date.now();
    if (this.outstanding !== null)
      this.violations.push(
        `a save of ${designId} was sent while a save of ${this.outstanding.designId} was out`,
      );
    const notBefore = this.notBeforeMs.get(designId) ?? 0;
    if (now < notBefore)
      this.violations.push(
        `a save of ${designId} was sent ${String(notBefore - now)} ms before the time its wait ends`,
      );
    if (
      this.lastStoredAtMs !== null &&
      now - this.lastStoredAtMs < MIN_SAVE_INTERVAL_MS
    )
      this.violations.push(
        `a save of ${designId} was sent ${String(now - this.lastStoredAtMs)} ms after the last one stored`,
      );
    if (
      expectedRevision === null ||
      !this.knownRevisionsOf(designId).has(expectedRevision)
    )
      this.violations.push(
        `a save of ${designId} stated revision ${String(expectedRevision)}, whose document the tab was never shown and never wrote`,
      );
  }

  private decideOutstanding(answer: SaveAnswer): void {
    const save = this.outstanding;
    if (save === null || save.decided !== null) return;
    save.decided = this.decisionFor(save, answer);
  }

  /** The waits the tab owes are counted from the answer's arrival, as the writer counts them. */
  private answerOutstanding(answer: SaveAnswer): void {
    const save = this.outstanding;
    if (save === null) return;
    this.decideOutstanding(answer);
    this.outstanding = null;
    const decided = save.decided;
    if (decided === null) return;
    if (decided.status === SERVER_ERROR_STATUS)
      this.startBackoff(save.designId);
    if (decided.status === LIMIT_STATUS) this.startLimitWait(save, decided);
    if (decided.ok) this.lastStoredAtMs = Date.now();
    save.respond(decided);
  }

  private decisionFor(save: OutstandingSave, answer: SaveAnswer): Response {
    if (answer === "stored") return this.storeIt(save);
    this.savesNotStored.set(
      save.designId,
      (this.savesNotStored.get(save.designId) ?? 0) + 1,
    );
    if (answer === "failed") return json({}, SERVER_ERROR_STATUS);
    return json({ code: "SAVE_LIMIT_REACHED" }, LIMIT_STATUS, {
      "Retry-After": String(limitSecondsOf(answer)),
    });
  }

  private startLimitWait(save: OutstandingSave, decided: Response): void {
    const seconds = Number(decided.headers.get("Retry-After"));
    this.notBeforeMs.set(save.designId, Date.now() + seconds * SECOND_MS);
  }

  private storeIt(save: OutstandingSave): Response {
    const stored = this.storedCopyOf(save.designId);
    if (save.expectedRevision !== stored.revision) {
      this.violations.push(
        `a save of ${save.designId} stated revision ${String(save.expectedRevision)} while ${stored.revision} is stored: a conflict with no other writer`,
      );
      return json({}, CONFLICT_STATUS);
    }
    const revision = String(Number(stored.revision) + 1);
    this.historyOf(save.designId).push({
      revision,
      design: JSON.parse(save.body) as Design,
    });
    this.knownRevisionsOf(save.designId).add(revision);
    this.failuresInARow.set(save.designId, 0);
    return json({ id: save.designId, revision });
  }

  private startBackoff(designId: DesignName): void {
    const failures = (this.failuresInARow.get(designId) ?? 0) + 1;
    this.failuresInARow.set(designId, failures);
    const backoff = Math.min(
      BACKOFF_BASE_MS * 2 ** (failures - 1),
      BACKOFF_MAX_MS,
    );
    this.notBeforeMs.set(designId, Date.now() + backoff);
  }

  private check(after: string): void {
    const found = [
      ...this.cleanAndWritableIsTheStoredCopy(),
      ...this.everyEditIsStoredOrShownUnsaved(),
      ...this.timersAndRequestsAreOwed(),
      ...this.revisionStandsBesideItsDocument(),
      ...this.aHeldWriteHasSomethingThatWillSendIt(),
    ];
    for (const sentence of found)
      this.violations.push(`after ${after}: ${sentence}`);
  }

  /** Wherever an edit is offered on a clean copy, that copy is the stored design at the stored revision. */
  cleanAndWritableIsTheStoredCopy(): string[] {
    const { canWrite, design, savedDesign, revision } = this.state;
    if (canWrite !== true || design !== savedDesign) return [];
    const stored = this.storedCopyOf(this.onScreen);
    if (revision !== stored.revision)
      return [
        `an edit is offered on a clean copy at revision ${String(revision)} while ${stored.revision} is stored`,
      ];
    if (!sameIds(placementIdsOf(design), placementIdsOf(stored.design)))
      return [
        `an edit is offered on a clean copy at the stored revision ${stored.revision} that is not the stored design`,
      ];
    return [];
  }

  /** At every moment, for the design on screen: an edit is stored, or it is on the screen and not shown as saved. */
  private everyEditIsStoredOrShownUnsaved(): string[] {
    const { design, savedDesign } = this.state;
    const stored = placementIdsOf(this.storedCopyOf(this.onScreen).design);
    const shown = placementIdsOf(design);
    const found: string[] = [];
    for (const removed of this.editsOf(this.onScreen)) {
      if (!stored.includes(removed)) continue;
      if (shown.includes(removed))
        found.push(
          `the edit that removed ${removed} is neither stored nor on the screen`,
        );
      else if (design === savedDesign)
        found.push(
          `the edit that removed ${removed} is not stored and the screen shows it as saved`,
        );
    }
    return found;
  }

  /** No more timers than one wait for each design that owes a write, and the one interval; no save beyond those owed. */
  private timersAndRequestsAreOwed(): string[] {
    const found: string[] = [];
    const owing = this.designsWithAnUnstoredEdit().length;
    const timers = vi.getTimerCount();
    if (timers > owing + 1)
      found.push(
        `${String(timers)} timers are armed while ${String(owing)} designs owe a write`,
      );
    for (const name of ["design-a", "design-b"] as const) {
      const sent = this.savesSent.get(name) ?? 0;
      const owed =
        this.editsOf(name).length + (this.savesNotStored.get(name) ?? 0);
      if (sent > owed)
        found.push(
          `${String(sent)} saves of ${name} were sent where ${String(owed)} were owed`,
        );
    }
    return found;
  }

  /** The revision is one whose document the tab was shown or wrote, and a clean copy is that document. */
  private revisionStandsBesideItsDocument(): string[] {
    const { design, savedDesign, revision } = this.state;
    if (
      revision === null ||
      !this.knownRevisionsOf(this.onScreen).has(revision)
    )
      return [
        `the store is at revision ${String(revision)}, whose document it was never shown and never wrote`,
      ];
    if (design !== savedDesign) return [];
    const document = this.historyOf(this.onScreen).find(
      (entry) => entry.revision === revision,
    );
    if (
      document === undefined ||
      !sameIds(placementIdsOf(design), placementIdsOf(document.design))
    )
      return [
        `the store shows as saved at revision ${revision} a design that is not the document of that revision`,
      ];
    return [];
  }

  /** A write the tab holds has a timer armed or a request out; a ready ticket with neither would never be sent. */
  private aHeldWriteHasSomethingThatWillSendIt(): string[] {
    const owing = this.designsWithAnUnstoredEdit();
    if (owing.length === 0) return [];
    if (this.outstanding !== null || vi.getTimerCount() > 0) return [];
    return [
      `${owing.join(" and ")} owe a write, and no timer is armed and no request is out`,
    ];
  }

  private checkAtRest(): void {
    const owing = this.designsWithAnUnstoredEdit();
    if (owing.length > 0)
      this.violations.push(
        `at rest: ${owing.join(" and ")} hold an edit that was never stored`,
      );
    if (vi.getTimerCount() > 0)
      this.violations.push(
        `at rest: ${String(vi.getTimerCount())} timers are still armed`,
      );
    const { design, savedDesign, saveStatus, canWrite } = this.state;
    if (design !== savedDesign || saveStatus !== "idle" || canWrite !== true)
      this.violations.push(
        `at rest: the screen is ${saveStatus}, ${design === savedDesign ? "saved" : "unsaved"}, write access ${String(canWrite)}`,
      );
  }

  private designsWithAnUnstoredEdit(): DesignName[] {
    return (["design-a", "design-b"] as const).filter((name) => {
      const stored = placementIdsOf(this.storedCopyOf(name).design);
      return this.editsOf(name).some((removed) => stored.includes(removed));
    });
  }

  private storedCopyOf(name: DesignName): StoredRevision {
    const latest = this.historyOf(name).at(-1);
    if (latest === undefined) throw new Error("no revision was ever stored");
    return latest;
  }

  private historyOf(name: DesignName): StoredRevision[] {
    const entries = this.history.get(name);
    if (entries === undefined) throw new Error(`unknown design ${name}`);
    return entries;
  }

  private editsOf(name: DesignName): string[] {
    const edits = this.editsMade.get(name);
    if (edits === undefined) throw new Error(`unknown design ${name}`);
    return edits;
  }

  private knownRevisionsOf(name: DesignName): Set<string> {
    const known = this.knownRevisions.get(name);
    if (known === undefined) throw new Error(`unknown design ${name}`);
    return known;
  }
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, i) => id === right[i]);
}
