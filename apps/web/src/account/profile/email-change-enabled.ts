/**
 * Whether e-mail change is reachable: the profile control, the confirm page, `POST /api/account/email-change` and
 * `/confirm`. Off until the owner rules O19 and the `UPDATE (email, email_normal_form)` grant is made (runbook step 4b).
 * Typed `boolean` so the branches it guards are not read as dead code. Neither `"use client"` nor `"server-only"`.
 */
export const EMAIL_CHANGE_ENABLED = false as boolean;
