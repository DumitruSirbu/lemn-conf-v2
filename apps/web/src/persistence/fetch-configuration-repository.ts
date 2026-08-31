// The browser half of the write path (`docs/decisions/0010-m3-client-write-path-unwired.md`
// decision 1): the domain's `ConfigurationRepository` implemented over the routes M2 and Wave
// 3C-2a shipped. The server-side port is deliberately a different interface — `saveAuthorized`
// takes a credential, because a server has no ambient one. Here the credential is ambient: it is
// the per-design `HttpOnly` cookie the mint response set (ADR 0019 decision 1), which the browser
// attaches on its own. No code in this file reads, holds or logs it.
import {
  DesignSchema,
  InvalidDesignError,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";

import {
  DesignRequestFailedError,
  isRetryableStatus,
  REVISION_CONFLICT_STATUS,
  WriteConflictError,
  WriteNotAuthorizedError,
  WriteNotRetryableError,
} from "./design-request-errors";

// Re-exported because these errors are part of this adapter's contract: a caller holding the
// repository should not have to know which module its failures are declared in.
export {
  DesignRequestFailedError,
  WriteConflictError,
  WriteNotAuthorizedError,
  WriteNotRetryableError,
};

const DESIGNS_ENDPOINT = "/api/designs";

/** Must match `EXPECTED_REVISION_HEADER` in `app/api/designs/[id]/route.ts`, which is the one thing
 *  that reads it. Stated on both sides rather than shared through a module, because the client
 *  bundle must not import from a route handler. */
const EXPECTED_REVISION_HEADER = "x-expected-revision";

/**
 * How long a load may stay in flight before it is treated as failed.
 *
 * A hung request is not a slow one, and `fetch` never distinguishes them: a captive portal, a hung
 * proxy, or a mobile network that blackholes rather than resets leaves the promise pending forever.
 * `/d/{id}`'s write-access probe turns that into a permanently disabled panel with no control to
 * press, because `"checking"` deliberately carries no retry — only `"check-failed"` does (finding
 * S7-F1). So the wait has to end somewhere, and it ends in the retryable failure the panel already
 * knows how to offer a way out of.
 *
 * Ten seconds: long enough for a cold serverless function plus a Neon cold start over a slow mobile
 * connection, short enough that a blackholed request does not hold the controls for a minute. The
 * cost of being too short is one press of "Încearcă din nou"; the cost of having no bound at all is
 * a dead end no interaction can leave.
 */
const LOAD_TIMEOUT_MS = 10_000;

/** What a load answers: the document, the revision it was read at, and whether the browser that
 *  asked for it holds the write credential. All three travel together because they come from the
 *  same response — and a document separated from its revision cannot be written back safely. */
export interface LoadedDesign {
  readonly design: Design;
  readonly revision: DesignRevision;
  readonly canWrite: boolean;
}

/**
 * One save, as one value.
 *
 * Grouped rather than passed as four positional arguments: `id`, the mint identity and the revision
 * are three opaque values of two types, and a call site that swapped two of them would compile.
 */
export interface ClientSaveRequest {
  readonly id: DesignId | null;
  readonly design: Design;
  /** The revision this document was derived from. **Ignored when `id` is `null`**: a mint decides
   *  its own first revision, and nothing before it could have known one. */
  readonly expectedRevision: DesignRevision | null;
  /** Opaque, and meaningful only when `id` is `null`. Reusing it deduplicates a mint across
   *  retries/overlap for one fresh design; a different value deliberately means a different one. */
  readonly provisionalMintIdentity?: object | undefined;
}

/** What a successful save answers: where the design now lives, and the revision the next save for
 *  it must expect. */
export interface ClientSaveResult {
  readonly id: DesignId;
  readonly revision: DesignRevision;
}

/** What one `PUT` is aimed at, once a mint has resolved: the row, and the revision the write is
 *  conditional on. `null` is a caller that supplied none for an already-persisted design, which the
 *  route refuses — see `update`. */
interface SaveTarget {
  readonly id: DesignId;
  readonly expectedRevision: DesignRevision | null;
}

/** The write routes answer 403 for a missing or wrong credential (ADR 0019 decision 1); 401 is
 *  included because a future gateway may answer with it and it means the same thing here. */
const NOT_AUTHORIZED_STATUSES: readonly number[] = [401, 403];

function isNotAuthorized(status: number): boolean {
  return NOT_AUTHORIZED_STATUSES.includes(status);
}

/** The failure a status deserves: something no retry can change, or a transient fault worth
 *  repeating. One classifier, so every request in this file answers the "is this worth retrying?"
 *  question the same way. */
function failureFor(
  operation: string,
  status: number,
): DesignRequestFailedError {
  return isRetryableStatus(status)
    ? new DesignRequestFailedError(operation, `HTTP status ${String(status)}`)
    : new WriteNotRetryableError(operation, status);
}

/** The same, for the one request that carries a credential. Only `PUT` can be refused *for want of
 *  the write token*; `POST /api/designs` presents no credential at all, so a 403 there means
 *  something else entirely (a firewall, say) and must not be reported as "this browser cannot
 *  edit this design". */
function saveFailureFor(
  operation: string,
  status: number,
): DesignRequestFailedError {
  if (isNotAuthorized(status))
    return new WriteNotAuthorizedError(operation, status);
  // Before the general classifier, which would otherwise fold a 409 into the undifferentiated
  // terminal failure and lose the one refusal the customer is offered a choice about.
  if (status === REVISION_CONFLICT_STATUS)
    return new WriteConflictError(operation, status);
  return failureFor(operation, status);
}

/**
 * The browser's design store over `fetch`. Every non-2xx response **rejects**, so the save
 * coalescer's existing retry/backoff drives it; nothing here swallows a failure into a resolved
 * promise, which would let the store believe a design is stored when it is not.
 *
 * One instance per session — `sessionConfigurationRepository` below is that instance, and every
 * caller in the app uses it. Minting exactly once **per provisional design identity** is this
 * class's own guarantee and does not lean on the coalescer serialising its callers: see
 * `resolveTarget`. Two fresh store generations deliberately carry two identities and mint two
 * rows; retries and overlapping calls for either one reuse its single mint.
 *
 * It deliberately no longer implements the domain's `ConfigurationRepository`. That interface's
 * `save(id, design)` is a last-write-wins contract by construction — there is nowhere in it to say
 * which revision the document came from — and WEB-003 is exactly the defect of writing without
 * saying so. Nothing in the app held this through that interface.
 */
export class FetchConfigurationRepository {
  /** A weak key lets a completed coalescer generation and its cached mint be collected together. */
  private readonly mintedIds = new WeakMap<object, Promise<ClientSaveResult>>();
  /** Direct two-argument callers retain the historical one-provisional-design behaviour. */
  private readonly defaultProvisionalMintIdentity = {};

  async save(request: ClientSaveRequest): Promise<ClientSaveResult> {
    const target = await this.resolveTarget(request);
    return this.update(target, request.design);
  }

  /**
   * The design, its revision **and** whether this browser may edit it — one `GET`, no extra round
   * trip.
   *
   * `canWrite` is the server's report of the `HttpOnly` cookie this request carried (ADR 0019
   * decision 1). It exists so the panel can disable what it cannot perform instead of discovering
   * the refusal by attempting a save. It is advisory: a write is still authorised by the row, and a
   * `true` here is never permission to skip handling a refusal.
   */
  async loadWithAccess(id: DesignId): Promise<LoadedDesign> {
    const response = await this.requestWithinTimeout(
      designEndpointFor(id),
      { method: "GET" },
      "Loading a design",
    );
    if (!response.ok) throw failureFor("Loading a design", response.status);
    const payload = await readJsonBody(response, "Loading a design");
    return {
      design: readDesign(payload),
      revision: readRevision(payload, "Loading a design"),
      canWrite: readCanWrite(payload),
    };
  }

  /**
   * The id this save must write to and the revision it must expect, minting once for its
   * provisional identity. A second row for that identity would silently fork one design, so both
   * ways of getting one are closed here.
   *
   * *Sequentially*: the store's `designId` is only set once a save has **fully** succeeded, so a
   * mint followed by a failing update leaves the caller still passing `null`; the identity's
   * cached promise makes the retry an update rather than a second mint.
   *
   * *Concurrently*: `await`ing the mint and then assigning is three steps, so two overlapping
   * `save` calls with a null id would both read `null` and both mint. Remembering the in-flight
   * **promise** collapses them into one request. The coalescer does serialise its saves, but that
   * is another object's private flag; this class owns the id, so it owns the guarantee.
   *
   * A **fulfilled** promise is kept while its opaque identity remains reachable, and awaiting it
   * again is free. A **rejected** one is discarded, so a transient mint failure is retried by the
   * next save; caching the rejection would make every later attempt for that design fail.
   *
   * The mint's own revision is cached with its id and deliberately not re-read. A retry of the
   * first update is a retry of a write that, as far as this browser knows, never landed — so it
   * must expect the revision the mint produced, not a fresher one it never observed.
   */
  private async resolveTarget({
    id,
    expectedRevision,
    provisionalMintIdentity = this.defaultProvisionalMintIdentity,
  }: ClientSaveRequest): Promise<SaveTarget> {
    if (id !== null) return { id, expectedRevision };

    const minted = await this.mintOnce(provisionalMintIdentity);
    return { id: minted.id, expectedRevision: minted.revision };
  }

  private mintOnce(provisionalMintIdentity: object): Promise<ClientSaveResult> {
    const existing = this.mintedIds.get(provisionalMintIdentity);
    if (existing) return existing;

    const minted = this.mint().catch((error: unknown) => {
      this.mintedIds.delete(provisionalMintIdentity);
      throw error;
    });
    this.mintedIds.set(provisionalMintIdentity, minted);
    return minted;
  }

  /** `POST /api/designs` takes no body: it creates the row from the seeded fixture and, in the
   *  same response, sets the write-token cookie scoped to the new id. The customer's own design
   *  therefore travels in the `PUT` that always follows — without it the first edit would never
   *  reach the database. */
  private async mint(): Promise<ClientSaveResult> {
    const response = await this.request(DESIGNS_ENDPOINT, { method: "POST" });
    if (!response.ok) throw failureFor("Minting a design", response.status);
    return readSaveResult(
      await readJsonBody(response, "Minting a design"),
      "Minting a design",
    );
  }

  /**
   * The conditional write. The expected revision rides in a header and is **never** derived here:
   * only a value the server itself produced — a mint's, or the previous successful save's — is a
   * revision this browser is entitled to claim.
   *
   * A missing expectation is sent as no header at all, which the route refuses with a 400. That is
   * a wiring fault rather than a reachable state, and refusing is how it stays visible: defaulting
   * to some revision here would be this file quietly deciding what a write may overwrite.
   */
  private async update(
    { id, expectedRevision }: SaveTarget,
    design: Design,
  ): Promise<ClientSaveResult> {
    const response = await this.request(designEndpointFor(id), {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(expectedRevision === null
          ? {}
          : { [EXPECTED_REVISION_HEADER]: expectedRevision }),
      },
      body: JSON.stringify(design),
    });
    // A refusal the caller must branch on rather than parse out of a message — see
    // `design-request-errors.ts` for where the retryable/terminal line is drawn and why.
    if (!response.ok) throw saveFailureFor("Saving a design", response.status);
    return readSaveResult(
      await readJsonBody(response, "Saving a design"),
      "Saving a design",
    );
  }

  /**
   * A `request` that cannot hang, for the one path where hanging is worse than failing.
   *
   * **Only the read path is bounded, and deliberately so.** A save's timing is the coalescer's
   * concern — it already has retry, backoff and a terminal state — and aborting a `PUT` in flight
   * would leave the browser unable to say whether the write landed, which is a worse answer than a
   * slow one. A `GET` carries no such ambiguity: nothing was changed, so asking again is free.
   *
   * Built from an `AbortController` and a cleared timer rather than `AbortSignal.timeout`, because
   * this one has to be observable: the timer is what a test advances, and clearing it stops every
   * completed load leaving a pending timeout behind it.
   */
  private async requestWithinTimeout(
    url: string,
    init: RequestInit,
    operation: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const expiry = setTimeout(() => {
      controller.abort();
    }, LOAD_TIMEOUT_MS);
    try {
      return await this.request(url, { ...init, signal: controller.signal });
    } catch (error) {
      throw asTimeoutFailure(error, controller.signal, operation);
    } finally {
      clearTimeout(expiry);
    }
  }

  /** Every request goes through here for one reason: `credentials`. The routes are same-origin, so
   *  the browser default (`same-origin`) already sends the write-token cookie — stating it is what
   *  stops a later refactor to an absolute URL or a wrapper with a different default from dropping
   *  the credential and turning every save into a 403. */
  private async request(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, { ...init, credentials: "same-origin" });
  }
}

/**
 * The session's one repository, which is what makes "one instance per session" true rather than
 * merely documented. Every caller in the app — the store's save coalescer and `/d/{id}`'s write
 * access probe — goes through this. The coalescer supplies the provisional identity, so this
 * singleton can distinguish a real second fresh design while deduplicating every retry of the
 * first.
 *
 * Constructed at module load rather than lazily: the constructor only initialises a field, issues no
 * request and touches no browser API, so it is inert on the server too.
 */
export const sessionConfigurationRepository =
  new FetchConfigurationRepository();

/** An aborted `fetch` rejects with a `DOMException`, which is a browser type and not this adapter's
 *  contract: every other failure here is a `DesignRequestFailedError`, and a caller branching on
 *  that contract would miss this one entirely. Anything the timeout did not cause is passed through
 *  untouched — a network error is already the right shape and must not be relabelled a timeout. */
function asTimeoutFailure(
  error: unknown,
  signal: AbortSignal,
  operation: string,
): unknown {
  if (!signal.aborted) return error;
  return new DesignRequestFailedError(
    operation,
    `no response within ${String(LOAD_TIMEOUT_MS)} ms`,
  );
}

function designEndpointFor(id: DesignId): string {
  return `${DESIGNS_ENDPOINT}/${encodeURIComponent(id)}`;
}

async function readJsonBody(
  response: Response,
  operation: string,
): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new DesignRequestFailedError(
      operation,
      "the response body was not parseable JSON",
    );
  }
}

/** The `{ id, revision }` a mint and a save both answer with. Both halves are required: a save
 *  result missing its revision would leave the next save with nothing to expect, and silently
 *  reusing the old one is how a client starts overwriting its own newer state. */
function readSaveResult(payload: unknown, operation: string): ClientSaveResult {
  const body = payload as { id?: unknown; revision?: unknown } | null;
  if (typeof body?.id !== "string" || body.id === "") {
    throw new DesignRequestFailedError(
      operation,
      "the response carried no design id",
    );
  }
  if (typeof body.revision !== "string" || body.revision === "") {
    throw new DesignRequestFailedError(
      operation,
      "the response carried no design revision",
    );
  }
  return { id: body.id, revision: body.revision };
}

/** The revision a load reports. Rejected rather than defaulted when absent, for the reason
 *  `readSaveResult` rejects one: a design held without the revision it was read at cannot be
 *  written back without guessing, and guessing here is the defect this wave removed. */
function readRevision(payload: unknown, operation: string): DesignRevision {
  const revision = (payload as { revision?: unknown } | null)?.revision;
  if (typeof revision !== "string" || revision === "") {
    throw new DesignRequestFailedError(
      operation,
      "the response carried no design revision",
    );
  }
  return revision;
}

/** Absent or non-boolean reads as **false**: a design that came back over the wire is one the
 *  browser may or may not hold a credential for, and §9's "never offer what cannot be satisfied"
 *  makes read-only the safe reading of an answer we did not get. A design that was never loaded is
 *  the opposite case and is not decided here — see the store's own default. */
function readCanWrite(payload: unknown): boolean {
  return (payload as { canWrite?: unknown } | null)?.canWrite === true;
}

/** The load route answers `{ id, design, canWrite }`. The payload is validated rather than trusted: this is
 *  the same parse-then-validate the server load path performs, and a design that fails it rejects
 *  with the interface's own `InvalidDesignError` rather than reaching the store. */
function readDesign(payload: unknown): Design {
  const result = DesignSchema.safeParse(
    (payload as { design?: unknown } | null)?.design,
  );
  if (!result.success) throw new InvalidDesignError(result.error.message);
  return result.data;
}
