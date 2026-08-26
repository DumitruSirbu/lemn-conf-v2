// The browser half of the write path (`docs/decisions/0010-m3-client-write-path-unwired.md`
// decision 1): the domain's `ConfigurationRepository` implemented over the routes M2 and Wave
// 3C-2a shipped. The server-side port is deliberately a different interface — `saveAuthorized`
// takes a credential, because a server has no ambient one. Here the credential is ambient: it is
// the per-design `HttpOnly` cookie the mint response set (ADR 0019 decision 1), which the browser
// attaches on its own. No code in this file reads, holds or logs it.
import {
  DesignSchema,
  InvalidDesignError,
  type ConfigurationRepository,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";

import {
  DesignRequestFailedError,
  isRetryableStatus,
  WriteNotAuthorizedError,
  WriteNotRetryableError,
} from "./design-request-errors";

// Re-exported because these errors are part of this adapter's contract: a caller holding the
// repository should not have to know which module its failures are declared in.
export {
  DesignRequestFailedError,
  WriteNotAuthorizedError,
  WriteNotRetryableError,
};

const DESIGNS_ENDPOINT = "/api/designs";

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
  return isNotAuthorized(status)
    ? new WriteNotAuthorizedError(operation, status)
    : failureFor(operation, status);
}

/**
 * `ConfigurationRepository` over `fetch`. Every non-2xx response **rejects**, so the save
 * coalescer's existing retry/backoff drives it; nothing here swallows a failure into a resolved
 * promise, which would let the store believe a design is stored when it is not.
 *
 * One instance per session. Minting exactly once is this class's own guarantee and does not lean on
 * the coalescer serialising its callers: see `resolveTargetId`.
 */
export class FetchConfigurationRepository implements ConfigurationRepository {
  /** The session's one mint, held as the **promise** rather than its awaited value — see
   *  `resolveTargetId` for why the difference is the whole guarantee. */
  private mintedId: Promise<DesignId> | null = null;

  async save(id: DesignId | null, design: Design): Promise<DesignId> {
    return this.update(await this.resolveTargetId(id), design);
  }

  async load(id: DesignId): Promise<Design> {
    const response = await this.request(designEndpointFor(id), {
      method: "GET",
    });
    if (!response.ok) throw failureFor("Loading a design", response.status);
    return readDesign(await readJsonBody(response, "Loading a design"));
  }

  /**
   * The id this save must write to, minting one only when no id exists anywhere. A second row
   * would silently fork the design, so both ways of getting one are closed here.
   *
   * *Sequentially*: the store's `designId` is only set once a save has **fully** succeeded, so a
   * mint followed by a failing update leaves the caller still passing `null`; `mintedId` is what
   * makes the retry an update rather than a second mint.
   *
   * *Concurrently*: `await`ing the mint and then assigning is three steps, so two overlapping
   * `save(null, …)` calls would both read `null` and both mint. Remembering the in-flight
   * **promise** collapses them into one request. The coalescer does serialise its saves, but that
   * is another object's private flag; this class owns the id, so it owns the guarantee.
   *
   * A **fulfilled** promise is kept for the rest of the session — it holds the one id this session
   * ever minted, and awaiting it again is free. A **rejected** one is discarded, so a mint that
   * failed on a transient error is retried by the next save; caching the rejection would make every
   * later save fail for as long as the tab stayed open.
   */
  private resolveTargetId(id: DesignId | null): Promise<DesignId> {
    if (id !== null) return Promise.resolve(id);

    this.mintedId ??= this.mint().catch((error: unknown) => {
      this.mintedId = null;
      throw error;
    });
    return this.mintedId;
  }

  /** `POST /api/designs` takes no body: it creates the row from the seeded fixture and, in the
   *  same response, sets the write-token cookie scoped to the new id. The customer's own design
   *  therefore travels in the `PUT` that always follows — without it the first edit would never
   *  reach the database. */
  private async mint(): Promise<DesignId> {
    const response = await this.request(DESIGNS_ENDPOINT, { method: "POST" });
    if (!response.ok) throw failureFor("Minting a design", response.status);
    return readDesignId(
      await readJsonBody(response, "Minting a design"),
      "Minting a design",
    );
  }

  private async update(id: DesignId, design: Design): Promise<DesignId> {
    const response = await this.request(designEndpointFor(id), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(design),
    });
    // A refusal the caller must branch on rather than parse out of a message — see
    // `design-request-errors.ts` for where the retryable/terminal line is drawn and why.
    if (!response.ok) throw saveFailureFor("Saving a design", response.status);
    return readDesignId(
      await readJsonBody(response, "Saving a design"),
      "Saving a design",
    );
  }

  /** Every request goes through here for one reason: `credentials`. The routes are same-origin, so
   *  the browser default (`same-origin`) already sends the write-token cookie — stating it is what
   *  stops a later refactor to an absolute URL or a wrapper with a different default from dropping
   *  the credential and turning every save into a 403. */
  private async request(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, { ...init, credentials: "same-origin" });
  }
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

function readDesignId(payload: unknown, operation: string): DesignId {
  const id = (payload as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || id === "") {
    throw new DesignRequestFailedError(
      operation,
      "the response carried no design id",
    );
  }
  return id;
}

/** The load route answers `{ id, design }`. The payload is validated rather than trusted: this is
 *  the same parse-then-validate the server load path performs, and a design that fails it rejects
 *  with the interface's own `InvalidDesignError` rather than reaching the store. */
function readDesign(payload: unknown): Design {
  const result = DesignSchema.safeParse(
    (payload as { design?: unknown } | null)?.design,
  );
  if (!result.success) throw new InvalidDesignError(result.error.message);
  return result.data;
}
