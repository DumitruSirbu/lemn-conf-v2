// The browser half of the write path: `/api/designs` over `fetch`. Unlike the server-side port (`saveAuthorized`
// takes a credential) the credential here is ambient: the per-design `HttpOnly` cookie the mint response set
// (ADR 0019 decision 1). No code in this file reads, holds or logs it.
import {
  DesignSchema,
  InvalidDesignError,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";

import { withCreateDesignLock } from "./create-design-lock";
import {
  DesignRequestFailedError,
  isRetryableStatus,
  MINT_LIMIT_REACHED_CODE,
  MINT_LIMIT_REACHED_STATUS,
  MintLimitReachedError,
  REVISION_CONFLICT_STATUS,
  WriteConflictError,
  WriteNotAuthorizedError,
  WriteNotRetryableError,
} from "./design-request-errors";

// Re-exported because these errors are part of this adapter's contract: a caller holding the
// repository should not have to know which module its failures are declared in.
export {
  DesignRequestFailedError,
  MintLimitReachedError,
  WriteConflictError,
  WriteNotAuthorizedError,
  WriteNotRetryableError,
};

const DESIGNS_ENDPOINT = "/api/designs";

/** Must match `EXPECTED_REVISION_HEADER` in `app/api/designs/[id]/route.ts`, its one reader. Duplicated because
 *  the client bundle must not import from a route handler. */
const EXPECTED_REVISION_HEADER = "x-expected-revision";

/**
 * How long a load may stay in flight before it is treated as failed. `fetch` never distinguishes a hung request
 * from a slow one, and `/d/{id}`'s write-access probe offers a retry only from `"check-failed"`, not `"checking"`,
 * so the wait must end in that retryable failure. Ten seconds covers a cold serverless function plus a Neon cold
 * start on a slow connection; too short costs one press of "Încearcă din nou", no bound costs a dead end.
 */
const LOAD_TIMEOUT_MS = 10_000;

/** What a load answers: the document, the revision it was read at, and whether this browser holds the write
 *  credential. A document separated from its revision cannot be written back safely. */
export interface LoadedDesign {
  readonly design: Design;
  readonly revision: DesignRevision;
  readonly canWrite: boolean;
}

/** One save as one value: the opaque `id`, mint identity and revision could be swapped at a positional call site
 *  and still compile. */
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

/**
 * Whether a mint's answer is this application's day-limit refusal: a `429` whose body's own `code` is the limit's. Any
 * other `429` (no body, not JSON, another code, a body that will not read) is a throttle like any other and keeps its
 * retry. The code is compared and never shown.
 */
async function isMintLimitReached(response: Response): Promise<boolean> {
  if (response.status !== MINT_LIMIT_REACHED_STATUS) return false;
  try {
    const body: unknown = await response.json();
    return (
      typeof body === "object" &&
      body !== null &&
      (body as { code?: unknown }).code === MINT_LIMIT_REACHED_CODE
    );
  } catch {
    return false;
  }
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

/** The same, for the one request that carries a credential. Only `PUT` can be refused for want of the write token;
 *  a 403 on `POST /api/designs`, which presents none, means something else (a firewall) and must not read as
 *  "this browser cannot edit this design". */
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
 * The browser's design store over `fetch`. Every non-2xx response rejects, so the save coalescer's retry/backoff
 * drives it; swallowing a failure would let the store believe a design is stored when it is not.
 *
 * One instance per session (`sessionConfigurationRepository`). Minting once per provisional design identity is
 * this class's own guarantee (see `resolveTarget`): two fresh store generations carry two identities and mint two
 * rows, while retries and overlapping calls for one reuse its single mint.
 *
 * It does not implement the domain's `ConfigurationRepository`: that `save(id, design)` is last-write-wins and
 * has nowhere to say which revision the document came from.
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
   * The design, its revision and whether this browser may edit it, in one `GET`. `canWrite` is the server's report
   * of the `HttpOnly` cookie this request carried (ADR 0019 decision 1). It is advisory: a write is still
   * authorised by the row, so a `true` is never permission to skip handling a refusal.
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
   * The id this save must write to and the revision it must expect, minting once per provisional identity.
   * Sequentially: the store's `designId` is set only after a save fully succeeds, so a mint followed by a failing
   * update leaves the caller passing `null`; the cached promise makes the retry an update, not a second mint.
   * Concurrently: two overlapping saves with a null id would both read `null` and both mint, so the in-flight
   * promise is remembered rather than relying on the coalescer's own serialisation.
   * A fulfilled promise is kept while its identity is reachable; a rejected one is discarded so a transient mint
   * failure is retried. The mint's revision is cached with its id and not re-read: a retry of the first update
   * must expect the revision the mint produced.
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

  /** `POST /api/designs` takes no body: it creates the row from the seeded fixture and sets the write-token cookie
   *  in the same response, so the customer's own design travels in the `PUT` that always follows.
   *
   *  The only call to `POST /api/designs`, so the only place `withCreateDesignLock` wraps (ADR 0114 Amendment H6):
   *  both creation paths reach here through `save({ id: null })`. The lock spans the response, so a second tab's
   *  mint carries the cookie this one just set. */
  private async mint(): Promise<ClientSaveResult> {
    return withCreateDesignLock(async () => {
      const response = await this.request(DESIGNS_ENDPOINT, {
        method: "POST",
      });
      if (await isMintLimitReached(response)) {
        throw new MintLimitReachedError("Minting a design");
      }
      if (!response.ok) throw failureFor("Minting a design", response.status);
      return readSaveResult(
        await readJsonBody(response, "Minting a design"),
        "Minting a design",
      );
    });
  }

  /**
   * The conditional write. The expected revision rides in a header and is never derived here: only a value the
   * server produced (a mint's, or the previous save's) is one this browser may claim. A missing expectation is
   * sent as no header, which the route refuses with a 400: a wiring fault that must stay visible, not defaulted.
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
   * A `request` that cannot hang, for the one path where hanging is worse than failing. Only the read path is
   * bounded: a save's timing is the coalescer's, and aborting a `PUT` in flight would leave the browser unable to
   * say whether it landed. Built from an `AbortController` and a cleared timer, not `AbortSignal.timeout`, so a
   * test can advance it and no completed load leaves a pending timeout.
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

  /** Every request goes through here for `credentials`: stating `same-origin` stops a later refactor to an
   *  absolute URL or a wrapper with another default from dropping the cookie and turning every save into a 403. */
  private async request(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, { ...init, credentials: "same-origin" });
  }
}

/**
 * The session's one repository, which makes "one instance per session" true rather than documented. The coalescer
 * supplies the provisional identity, so this singleton distinguishes a second fresh design while deduplicating
 * every retry of the first. Constructed at module load: the constructor only initialises a field, so it is inert
 * on the server too.
 */
export const sessionConfigurationRepository =
  new FetchConfigurationRepository();

/** An aborted `fetch` rejects with a browser `DOMException`, not this adapter's `DesignRequestFailedError`.
 *  Anything the timeout did not cause passes through untouched. */
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

/** The revision a load reports. Rejected rather than defaulted when absent: a design held without the revision
 *  it was read at cannot be written back without guessing. */
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

/** Absent or non-boolean reads as false: §9's "never offer what cannot be satisfied" makes read-only the safe
 *  reading of an answer we did not get. A design that was never loaded is the store's default, not decided here. */
function readCanWrite(payload: unknown): boolean {
  return (payload as { canWrite?: unknown } | null)?.canWrite === true;
}

/** The load route answers `{ id, design, canWrite }`. The payload is validated, not trusted: a design that fails
 *  the parse rejects with `InvalidDesignError` rather than reaching the store. */
function readDesign(payload: unknown): Design {
  const result = DesignSchema.safeParse(
    (payload as { design?: unknown } | null)?.design,
  );
  if (!result.success) throw new InvalidDesignError(result.error.message);
  return result.data;
}
