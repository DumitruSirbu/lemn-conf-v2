/**
 * The e2e server's opt-in to the seeded fake price-book stores. Its own module with no `server-only`, so the Playwright
 * configuration can name it. The e2e server is a production build (`next start`), whose `NODE_ENV` alone would select the
 * stores of production; the flag is set in `playwright.config.ts` and in no env file, so no deployed environment has it.
 */
export const FAKE_PRICE_BOOK_FLAG = "LEMNARIA_E2E_FAKE_PRICE_BOOK";

/** Only this exact value opts in, so a stray `true`, `01` or ` 1` cannot read as "enabled". */
export const FAKE_PRICE_BOOK_FLAG_ENABLED = "1";
