# Replacing `DIGEST_SECRET`

Owed since wave 8H and written at wave 8F's close, 2026-10-09 [the rule: the plan's *The digest secret*, point 4; the consequences: ADR 0149's
amendment and [ADR 0155](../decisions/0155-the-mint-asks-a-keyed-per-day-per-network-limiter-first-and-refuses-what-it-cannot-judge-the-owner-names-the-network-source-and-a-destructive-mutant-never-touches-a-database.md)].
None of these steps has been executed. **The owner runs them. No agent generates, sets, reads or prints the value, in any environment**, and
environment variables are add-only except for the replacement this runbook describes, which the owner does knowingly
([environments-and-resources.md](../best-practices/environments-and-resources.md)).

**When:** whenever that environment's variables may have been seen, or when the value was first set with a defect (a pasted line break).
One environment at a time: a different value in each environment, so one that leaks from a preview opens nothing in production.

## The rule

1. **Make a new value yourself:** `openssl rand -hex 32` (thirty-two random bytes, sixty-four lowercase hexadecimal characters). Paste it
   nowhere but the host's variable form.
2. **Set it in that environment** on the host (and `apps/web/.env.local` for `pnpm dev`, if that is the environment) and **deploy**. Nothing is
   migrated and there is **no time with two keys**.
3. Never print the value, not in a terminal, a log or a message.

## What it costs, said before it is done

- **Every rate-limit count starts again.** The old rows go as their windows end, and **that day gets a second twenty**: a block that had used
  its twenty designs can make twenty more under the new key (ADR 0155, limits).
- **A contact request whose retry falls across the rotation is answered as a conflict**, its stored row and notice untouched (the stored digest
  no longer matches). This applies once the contact endpoint exists (wave 8K).

## The check afterwards

1. **Create one design in that environment.** A design made means the value is usable.
2. A **`503` with `MINT_UNAVAILABLE`** means the value is unusable: the code reads *unavailable* for anything but sixty-four lowercase
   hexadecimal characters, naming only the variable. **A trailing line break from a paste is the usual cause.** Set it again, without the
   break, and deploy.
3. Do not read the value back to check it.
