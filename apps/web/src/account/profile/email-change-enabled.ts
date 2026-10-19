/**
 * Whether the e-mail change is reachable from the product: the profile's "Schimbă e-mailul" and the confirm page. It
 * stays off until the owner rules F1 and the `UPDATE (email, email_normal_form)` grant is made. It gates the pages only;
 * `POST /api/account/email-change` and `/confirm` answer whatever the flag says. Typed `boolean` so the branches it
 * guards are not read as dead code.
 */
export const EMAIL_CHANGE_ENABLED = false as boolean;
