# ADR 0147 — The mint is limited to 20 a day per IP address, for everyone, and nothing else

Status: Accepted
Date: 2026-10-07
Type: Decision
Milestone: M8 (waves 8E, 8F and 8G build it; the delivery milestone inherits what it leaves open)

Supersedes, **for the mint only**, three decisions of
[ADR 0019](0019-security-baseline-writes-throttling-retention.md): the mint's row in decision 5, decision 4 as
it applies to the mint, and decision 3's session bucket as it applies to the mint. Everything else in ADR 0019
stands. The record was written by the documentation scribe from `docs/milestones/M8-review-contact-success.md`
(*The limit on new designs, as the owner ruled it*; *What is still open for M8 itself*; *M8 restated*), which
is where the architect's reasoning lives. Evidence tiers are that file's: **[doc]** quoted from a record in this
repository, **[inf]** the architect's inference.

## Context

M8's plan carried, from ADR 0019, a mint limit of ten new designs an hour and thirty a day per network, three
an hour and a challenge outside Moldova, and five an hour per browser. The coordinator relayed the owner a
question on it (Q23, then Q28) with the architect's recommendation. The owner's answers, 2026-10-07, each in
reply to a question the coordinator relayed, **verbatim**:

> like how many designs a user can generate? I think you worry for DDos and for this we need something like
> claudflare captcha or a performant bot shield, but limiting can be a option like not 10 but 20-30

Then, narrowing it:

> 20 design generation per day for all (we can track and adjust later this)

Asked whether that is per visitor, per network or both:

> per user (ip)

Asked whether the existing hourly limits (5 an hour per session, 10 an hour per network) stay or 20 a day is
the whole limit:

> 20 per day

The same day the owner ruled that a separate delivery-preparation milestone will carry hosting and flood
protection (*"lest focus on functionality and basic security for now"*; Q27) and named a bot shield or captcha
as the place for DDoS defence. The owner did not name the host, the database's home or the mail provider; those
are leanings, deferred to that milestone (see [M9](../milestones/M9-delivery-preparation.md)).

## Decision

**For creating a design (`POST /api/designs`, the mint): one counter, per IP address, 20 a day, the same for
everyone, and that is the whole limit.** The figure is provisional: *"we can track and adjust later"*. The
hourly limits, the per-browser limit and the tighter limit outside Moldova all go, **for the mint**. This is the
owner's ruling.

### What it supersedes in ADR 0019, quoted

- **Decision 5, the mint's row**, all four figures, ~~`POST /api/designs` (mint) | 10 / hour, 30 / day | 3 /
  hour + challenge | 5 / hour~~.
- **Decision 4, as it applies to the mint**: ~~*"Traffic from **MD** gets the ordinary limits. Everything else
  gets a much tighter limit and a `challenge` rather than a `deny`."*~~ The mint has no country in it. Decision
  4 still governs whatever other endpoint ever gets a country-dependent limit; the owner has not addressed
  those.
- **Decision 3, as it applies to the mint**: the *session cookie* bucket (*"repeated submits from one
  browser"*) and *"most restrictive wins"*, which has nothing to choose between when there is one bucket. Its
  *"IP aggregated to /24 (IPv4) and /64 (IPv6)"* is **not** decided here for IPv4: see Q32 below.
- The M8 plan's own launch-gate line (*"The mint limits … 10 an hour and 30 a day … 5 an hour per session,
  across rotations (D11)"*), Q15 (i), Q23's rider and Q28's recommendation of 30.

### How "for all" reads beside "Moldova only for now"

They do not conflict. The customers at launch are Moldovan (the dated note on ADR 0019 decision 4, from the same
day); the limiter does not tell one country from another when a design is created. [inf: the architect's
reading, which the owner has not confirmed.]

### What is untouched

Saves (`PUT`/`PATCH /api/designs/{id}`), shares, page reads and the contact form: the owner has not addressed
them, and *"20 per day"* is not extended to them. **ADR 0019 decision 5's figures for them stand.** One
consequence of the hosting ruling does reach them, and it is the architect's: M8 has no trusted fact about a
request's country, so for those rows M8 applies the record's Moldovan column to every request and builds no
second tier and no challenge. Whether they ever get one belongs to the delivery milestone, with the shield.
[inf]

### The architect's readings on top of the ruling

**Each of these is the architect's, not the owner's, and the owner may overrule it.**

- **IPv6 is counted per /64.** ADR 0019 decision 3: *"per-address IPv6 is worthless, since a single subscriber
  is routinely delegated an entire /64"*, and *"IPv6 /64 aggregation is not optional"*. A /64 is one
  subscriber, which is what the owner means by a user. [doc, from that record]
- **A day is the calendar day in Chișinău, as a fixed window.** ADR 0019 says *"/ day"* and no more. A refusal
  says the limit returns tomorrow. It is one row per address per day in 8E's table. The cost is 20 late one
  evening and 20 after midnight; it is a datum in the policy, cheap to change. [inf]
- **D11 no longer bears on the mint**, which has no per-browser bucket. It still bears on the per-browser
  figures that remain (saves at 300 an hour, the contact form at 2 an hour), since creating a design changes
  the visitor value and so would reset them. Preferred: key those two on the design, which a rotation does not
  change; fixed in 8G's and 8K's own first slice. [inf]
- **SEC-001's gate does not close in M8.** See below.

### Open: Q32 — for IPv4, one address or the block of 256 around it?

The owner said *"per user (ip)"*. ADR 0019 decision 3 counts a /24, to catch *"floods from one host or
network"*, and warns in the same row that *"CGNAT and mobile carriers put thousands of real customers behind one
address"*. The architect's recommendation, not a ruling: **one address for IPv4, the /64 for IPv6**, because it
is the owner's word and the limit is now about one person's use, not a flood (the shield's job). The question
put to the owner: *"Should the 20 a day be counted for each single internet address, or shared by the whole
neighbourhood of 256 addresses a provider hands out together?"* It sets one number in 8F's policy and does not
block the build; the wave builds the reduction for any prefix and proves both.

### SEC-001's gate and the 2026-08-31 correction

ADR 0019's correction of 2026-08-31 records the owner's condition that the mint deferral be *"tracked and
gated"*, and its operative sentence is that `POST /api/designs` *"must not be exposed to real traffic until the
application limiter, the 30-day abandoned-design retention cron, and the staged WAF rule ship together."* Two
things have since moved, and neither is changed by editing that sentence:

1. The retention cron was retired on 2026-09-15 (ADR 0019, *Supersession note: decision 7*); the replacement set
   is M8 question Q19 and is not ruled.
2. **M8 builds the application half (8E to 8G and 8K) and does not close the gate.** The gate goes whole, and
   unticked where M8 did not tick it, to the delivery milestone, because its operative sentence needs the WAF,
   which is a hosting matter and the owner moved hosting. This is **the architect's derivation, not the owner's
   sentence.** Nothing ships before every milestone is done, so no traffic can arrive in between. Until the
   delivery milestone has its own plan, the gate's text stays in the M8 plan's *Launch gate*.

### What 20 a day admits, and the named interim

One address: 20 rows a day at 523,972 bytes each, **10.0 MiB a day** (arithmetic on 8A S1's measured size, the
architect's). With no hourly limit all 20 can be spent in a minute. **Per-address abuse is bounded at 20 a day.
Abuse spread over many addresses is not bounded by the application at all**: ADR 0019's 1,000-an-hour brake is
a *challenge*, nothing in M8 can challenge, and the owner placed that defence in a bot shield. This is a named
interim until the delivery milestone.

### "Track"

The counter table holds, for each address and day, how many designs it made, so the owner's numbers exist while
a day's rows exist. The architect's named addition to 8G's prune: before a day's rows are deleted it writes one
line of totals for that day (addresses seen, addresses that reached the limit, the largest count) and no
address; a refusal also writes one line with no address. [inf: proposed, not yet built.]

### How an IP address is stored: no record decides it

**No record decides how an IP address is stored.** ADR 0114 hashes the visitor *secret*, which is random; ADR
0019 does not mention hashing an address. Hashing it was **plan decision D10**, and D10 is weaker than it
reads: an unkeyed hash of an IPv4 address can be undone by trying every address, so it shortens the value and
does not hide it from someone holding the table. What limits exposure is time: a day's rows are deleted once the
day is over and its totals written. A keyed hash would hide it and needs a secret variable in every
environment; **it goes to 8E's security reviewer as a question, and is not built by default.** The fact also
goes on the delivery milestone's list of what data is held where.

## Alternatives considered

1. **Keep ADR 0019's two tiers, with the outside tier gaining a day cap** (the coordinator's first reading of
   Q28). Not taken: it needs the request's country, which only the current development host supplies, and the
   challenge has no mechanism in M8. The owner chose one limit.
2. **One limit at the top of the owner's range, 30 a day and 10 an hour** (the architect's recommendation, so that
   no new figure was invented). Not taken: the owner chose 20 and asked for no hourly
   limit.
3. **Keep the hourly limits beside 20 a day.** Put to the owner as a question; the answer was *"20 per day"*.
4. **A per-browser bucket kept beside the address.** Not taken: *"per user (ip)"*. A browser bucket is reset by
   clearing cookies, which ADR 0019 decision 3 already said is its weakness.
5. **A /24 for IPv4.** Not decided: it is Q32.

## Consequences

- **8E** builds the counter store as one row per address per day. **8F** builds the mint's limiter as one
  bucket: the address, 20 a calendar day in Chișinău, for everyone; `429` with `Retry-After` the seconds to the
  day's end; fail closed. Under a host with no known client-address source, the whole deployment shares one
  bucket of 20, which is correct for a host nobody has named and an interim. **8G** prunes, with the totals
  line above.
- ADR 0019 carries the strike-throughs and a dated note pointing here; the pairs are in
  [SUPERSESSIONS.md](SUPERSESSIONS.md).
- The delivery milestone inherits: the DDoS half of Q23 (a bot shield or captcha), whether the one limit gains a
  second tier, the client address and country source, the launch gate, and the data list. See
  [M9](../milestones/M9-delivery-preparation.md).
- If Q32 is answered "the block", one number in 8F's policy changes and the reduction already exists.
- The 20 is provisional: the owner said *"we can track and adjust later"*. Changing it is a datum, not a
  decision to re-open.
