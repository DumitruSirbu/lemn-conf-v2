import type { VersionTextRefusalCode } from "@lemnaria/configurator-domain";

import type { PublishTextRefusalCode } from "./price-dashboard-wire-contract";

/** The code a route answers for a version's label or note the domain refused. `NOT_TEXT` is `malformed` before it is judged. */
export function publishTextRefusalCodeOf(
  code: VersionTextRefusalCode,
): PublishTextRefusalCode {
  switch (code) {
    case "REQUIRED":
      return "TEXT_EMPTY";
    case "TOO_LONG":
      return "TEXT_TOO_LONG";
    case "FORBIDDEN_CHARACTER":
    case "NOT_TEXT":
      return "TEXT_FORBIDDEN_CHARACTER";
  }
}
