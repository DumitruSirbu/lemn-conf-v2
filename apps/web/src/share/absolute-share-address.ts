/**
 * The address a share link is opened at: this site's origin and the path `issueShareLink` returned. It stays out of
 * `done/`, whose source scan forbids naming the page's address.
 */
export function absoluteShareAddress(path: string): string {
  return `${location.origin}${path}`;
}
