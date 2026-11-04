// How often the menu counter may ask for the number of changed kitchens, in one leaf module so the server's bound and the
// browser's timer read one figure. The count ranks every submission each time it is read, so the server answers from a
// count read at most this long ago (`lib/server/staff/changed-count-cache.ts`), and a poller that asks more often only
// reads the same number sooner. PROVISIONAL: the owner's answer changes this constant and no code.

export const CHANGED_COUNT_POLL_INTERVAL_SECONDS = 60;
