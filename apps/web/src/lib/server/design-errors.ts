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

/** The incoming save payload failed `DesignSchema` validation — the client's fault, hence 400. */
export function invalidBodyResponse(reason: string): NextResponse {
  return NextResponse.json(
    { error: `Design payload failed validation: ${reason}` },
    { status: 400 },
  );
}
