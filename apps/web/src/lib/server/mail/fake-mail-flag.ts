/** The e2e fake sender's opt-in. Its own module, apart from the mail's settings, so the public origin's reader can ask
 *  it without reaching what reads a mail setting. */
export const FAKE_MAIL_FLAG = "LEMNARIA_E2E_FAKE_MAIL";

/** Only this exact value opts in, so a stray `true`, `01` or ` 1` cannot read as "enabled". */
export const FAKE_MAIL_FLAG_ENABLED = "1";
