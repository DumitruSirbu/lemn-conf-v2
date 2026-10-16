"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import { useLocale } from "next-intl";
import { useSyncExternalStore } from "react";

import { getPathname } from "@/i18n/navigation";

import { editorHref } from "./design-hrefs";

/**
 * This design's editor as an absolute address in the page's locale, from the browser's own origin. The server has no
 * origin to name, so its render and the hydrating render show the path, and the address follows on the next render.
 * It lives outside `done/`, whose source scan forbids naming the page's address.
 */
export function useAbsoluteEditorAddress(designId: DesignId): string {
  const locale = useLocale();
  // The pathname alone: `editorHref`'s empty query would leave a trailing `?` on the address.
  const path = getPathname({ href: editorHref(designId).pathname, locale });
  return useSyncExternalStore(
    subscribeToNothing,
    () => `${location.origin}${path}`,
    () => path,
  );
}

/** The origin never changes while a page is up, so there is nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => undefined;
}
