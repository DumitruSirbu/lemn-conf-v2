import {
  DesignNotFoundError,
  InvalidDesignError,
} from "@lemnaria/configurator-domain";
import { NextResponse } from "next/server";

/** Maps a repository failure to a clean JSON error response. `InvalidDesignError` here means a
 *  *stored* document failed migration/validation on load — the client didn't cause it, so this is
 *  a 500, unlike `invalidBodyResponse` below, which is for a bad incoming payload on save. Any
 *  other error is a genuine bug, not a domain failure, so it is rethrown rather than masked. */
export function designErrorResponse(error: unknown): NextResponse {
  if (error instanceof DesignNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof InvalidDesignError) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  throw error;
}

/**
 * The incoming save payload failed `DesignSchema` validation — the client's fault, hence 400.
 *
 * The reason is logged, never returned. It is a Zod error tree naming every expected type and
 * failing path, which hands an unauthenticated caller the exact document shape to craft a valid
 * one. That matters here more than it usually would: the write routes have no authentication, so
 * the only thing standing between a probe and an overwrite is not knowing the schema — see ADR 0014
 * findings S1 and S2. A client needs to know its payload was rejected, not how the schema is built.
 */
export function invalidBodyResponse(reason: string): NextResponse {
  console.warn("[designs] rejected an invalid payload:", reason);
  return NextResponse.json(
    { error: "Design payload failed validation." },
    { status: 400 },
  );
}
