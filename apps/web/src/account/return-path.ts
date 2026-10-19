// Where a sign-in goes back to: the open kitchen, and nowhere else (plan Lot 2 C26, owner answer CD 4).
//
// The address carries it as `?returnTo=`, and a path that arrives that way is only a claim about where to go. The page
// that reads it follows it with a full document load, so anything but a design's own address in a language the
// application serves would be an open redirect. The list is closed: `/{locale}/d/{designId}` and nothing else. A value
// that is not exactly that has no meaning and the sign-in goes to the start of the configurator as it always did. The
// parse is of the value Next has already decoded once; it is never decoded again, since a second decoding is where an
// encoded slash, backslash or scheme would get through.

import { isDesignId } from "@lemnaria/configurator-domain";

import { routing, type AppLocale } from "@/i18n/routing";

import { loginPathWithReason, type LoginArrival } from "./login-arrival";

const RETURN_PATH_QUERY_NAME = "returnTo";

/** `/{locale}/d/{designId}` is `["", locale, "d", designId]`. */
const DESIGN_PATH_SEGMENT_COUNT = 4;

/** The path of a design's editor in this language, or nothing for a design not saved yet (it has no address to return
 *  to). The same shape `returnPathOf` accepts, so what the editor offers is always something the login page honours. */
export function returnPathOfDesign(
  locale: AppLocale,
  designId: string | null | undefined,
): string | undefined {
  return typeof designId === "string" && isDesignId(designId)
    ? `/${locale}/d/${designId}`
    : undefined;
}

/**
 * The path a `returnTo` query value names, or `undefined` for every value but a design's address. A repeated parameter
 * (an array) is no value. The result is built from the parts that matched, never echoed from the input.
 */
export function returnPathOf(
  value: string | readonly string[] | undefined,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const segments = value.split("/");
  if (segments.length !== DESIGN_PATH_SEGMENT_COUNT) return undefined;
  const [beforeFirstSlash, locale, designMarker, designId] = segments;
  if (beforeFirstSlash !== "" || designMarker !== "d") return undefined;
  const servedLocale = routing.locales.find((served) => served === locale);
  if (servedLocale === undefined) return undefined;
  return designId !== undefined && isDesignId(designId)
    ? `/${servedLocale}/d/${designId}`
    : undefined;
}

/** The login page, told why the person is sent there and where to go once they are in. Without a path it is the plain
 *  arrival. */
export function loginPathWithReturn(
  locale: AppLocale,
  arrival: LoginArrival,
  returnPath: string | undefined,
): string {
  const arrivalPath = loginPathWithReason(locale, arrival);
  if (returnPath === undefined) return arrivalPath;
  const query = new URLSearchParams({ [RETURN_PATH_QUERY_NAME]: returnPath });
  return `${arrivalPath}&${query.toString()}`;
}
