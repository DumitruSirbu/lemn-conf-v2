import { connection } from "next/server";

import { CallbackContactScreen } from "@/contact/contact-screen";
import { isContactSendable } from "@/lib/server/contact/contact-availability";

/**
 * The callback form, with no design (frame 2F's way on; Q12 (i)). It asks nothing of the customer's browser and loads
 * nothing, so it is rendered per request on purpose: `connection()` keeps it out of the prerender manifest, so the
 * CSP's nonce reaches its scripts and the server's environment is read when the page is asked for and not when it was
 * built (8L criterion 9). Only whether the server can take a request is handed on, as a boolean (criterion 7).
 */
export default async function CallbackContactPage() {
  await connection();
  return <CallbackContactScreen isSendable={isContactSendable(process.env)} />;
}
