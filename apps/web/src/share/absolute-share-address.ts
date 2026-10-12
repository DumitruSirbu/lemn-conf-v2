/**
 * The address a share link is opened at: this site's origin and the path `issueShareLink` returned. Composed where the
 * link is shown or sent (`share-link-client.ts`), never where it is issued. It lives beside the share control, not
 * with the confirmation, whose source may not name the page's address at all.
 */
export function absoluteShareAddress(path: string): string {
  return `${location.origin}${path}`;
}
