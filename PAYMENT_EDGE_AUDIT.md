# Payment and refund edge audit

## Scope and policy

Audited all Razorpay handlers in `app.js`: consultation order/verify, raw signed
webhook, document subscription/credit order/verify, cancellation and the pending
reservation expiry helper. Also checked document credit consumption and admin
routes. The approved admin refund workflow below now covers consultation support
refunds. There is no refund worker.

`src/data/policies.ts` is unchanged. Its consultation policy allows the owning
client to cancel before the start for a full refund, including any document
package fee. New cancellations at/after start are rejected. Lawyer/admin accounts
cannot use the client cancellation endpoint. An already-cancelled booking can
retry a failed refund even after its original start time.

Consultations never consume document credits: clients pay per consultation;
lawyers purchase document credits/monthly access. There is consequently no
consultation credit to restore. Document creation already conditionally decrements
credits inside the creation transaction; a real-DB concurrency regression covers
the last-credit case. Monthly access does not consume existing credits.

## Findings and fixes

| Severity | Reachable behavior before the change | Fix / regression |
| --- | --- | --- |
| High | Cancellation POSTed to `/v1/payments/:id/refunds`, not the documented singular `/refund`. | Correct endpoint; HTTP stub tests assert the path and full amount, including package fees. |
| High | Two cancellations could both call the provider before either recorded the refund. | Atomic durable refund claim, per-attempt provider idempotency header and attempt correlation in refund notes. Unit and real-DB concurrent cancellation tests. |
| High | A successful refund API response was immediately marked REFUNDED, even if still pending; refund webhooks were ignored. | Separate refund lifecycle; only `processed` becomes REFUNDED. Signed processed/failed events are correlated to an attempt. Duplicate, reordered and early-webhook tests. |
| High | A provider refund delivered before the capture webhook was ignored because the payment ID had not been stored yet. A later capture snapshot could grant already-refunded access. | Resolve refund events by their included order as a fallback. Fully processed external refunds prevent new fulfillment; partial/failed external attempts require review. Unit and real-DB out-of-order regressions. |
| High | Expired/cancelled pending reservations either got resurrected (if expiry had not run) or settlement rolled back with P2025 and webhook returned 200. Captured funds had no durable resolution. | Atomic reservation-age/status/start-time gate; record capture and a required full refund, without restoring cancelled rows. Real-DB tests include a replacement client in the same slot and cancellation racing capture. |
| High | Neither verify nor capture webhook compared expected amount/currency. Verify only checked the Checkout signature and could grant access before capture. | Verify fetches the provider payment; shared settlement validates ID, stored order, amount, currency and captured status. Mismatches never grant access and are flagged for review. |
| High | Two different monthly payments read expiry before either transaction, potentially granting only one extension; a simultaneous credit purchase could overwrite the active plan using stale user data. | Lock the account and read its current access inside settlement. Real-DB two-order monthly extension test. |
| Medium | `order.paid` alone was acknowledged without granting a booking/credit. | Handle payment and order paid events through the same conditional payment claim. Order metadata is checked as well; duplicate event and webhook/verify race tests. |
| Medium | A booked consultation bypassed signature verification on subsequent verify calls. Missing IDs could become omitted Prisma filters. | Validate signature and bounded safe IDs before lookup, including replay paths. |
| Medium | Provider/configuration or payment-persistence failure left an unpaid reservation blocking the slot for 15 minutes. | Check configuration before reserving; release a newly created reservation without a local payment on failure. Provider/persistence regression tests. |
| Medium | Purchase receipts used millisecond timestamps and could collide for concurrent orders. | Random bounded receipts; fixed-clock concurrent-order regression. |
| Medium | Notification failure could make a committed booking look like failed verification. | Notification failures are logged independently of successful financial settlement. |

Same-order duplicate settlement already had a conditional CREATED-to-PAID claim
and unique provider order/payment IDs. These protections are retained and shared
across both verification handlers and both capture event types. Real PostgreSQL
tests verify duplicate webhooks racing Checkout do not double-credit or book.

## Refund operations

New nullable payment fields record `refundStatus`, `refundId`, `refundAttemptId`,
`refundRequestedAt`, `refundError`; currency defaults/backfills to INR.

- `REQUIRED`: captured payment must be refunded; the initiating request attempts
  it after committing the financial record. A duplicate capture event or owning
  client's repeat cancellation can resume it after a process interruption.
- `PENDING`: an attempt has been claimed or accepted by Razorpay. Do not issue a
  new refund. Processed/failed webhooks finish it. Rows with no update for at
  least 15 minutes appear in the review queue and count with a provider-check
  action. Reconciliation promotes these to REVIEW before checking, so provider
  failures remain actionable. A read/check does not refresh an untouched pending
  row's timestamp. Correlated webhooks match payment ID and attempt key even if
  reconciliation is replacing a dashboard refund ID; conflicting writes request
  webhook redelivery instead of silently losing the terminal event.
- `FAILED`: explicit provider rejection or a matching failed webhook. The owning
  client's cancellation endpoint can retry. Capture replays only resume refunds
  owed for CANCELLED consultations: REQUIRED, or FAILED with an app-generated
  attempt ID. Imported dashboard failures do not authorize automatic refunds of
  active bookings or document purchases. Each confirmed-failed attempt gets a
  new ID when a refund is explicitly requested or an eligible retry resumes.
  A failed dashboard refund without the stored attempt's correlation notes
  cannot retire that attempt. If it replaced the stored refund ID, reconciliation
  searches the payment's paginated provider history for the original attempt and
  applies its authoritative status. Missing, conflicting or unavailable history
  retains REVIEW, even for cancelled bookings. An unrelated failure is not
  evidence that the app's ambiguous attempt failed.
- `REVIEW`: ambiguous network/5xx response, unexpected provider response,
  mismatched capture, or provider-dashboard refund outside tracked attempts.
  This is deliberately not automatically retried with a new key. Reconcile with
  Razorpay first to avoid refunding twice. Empty refund history is not proof that
  a recent ambiguous request failed. For **24 hours from refundRequestedAt**,
  reconciliation retains REVIEW and the original attempt ID, refund ID and
  timestamp; automatic and admin refund retries remain blocked. Repeated checks
  do not restart this window. Missing timestamps retain REVIEW until a provider
  outcome is found or an admin verifies records and manually resolves the item.
  Matching processed/pending/failed provider refunds are applied immediately.
  After 24 hours, empty history can release REVIEW only when a fresh provider
  payment lookup confirms captured status and exactly zero refunded amount.
  The payment then becomes retryable FAILED (or REQUIRED for a cancelled booking
  whose refund is resumed through the existing path). This retires the ambiguous
  attempt; a subsequent retry uses a new idempotency key. Before this release,
  any direct provider retry must use the original `X-Refund-Idempotency` key and
  identical amount/notes body. Do not reset state merely because an API response
  was lost. Manual overrides require independent provider verification and an
  audited note; this waiting window does not prevent recording such a resolution.
- `PROCESSED`: the full matching refund is processed; payment status is REFUNDED.

Cancellation is committed independently of provider availability so a refund
failure cannot lose eligibility when the scheduled start passes. Financial
failures return a support/retry error, and a durable state remains. A second
cancellation is idempotent while a refund is pending, processed or under review.
There is no automatic reconciliation scheduler.

### Executable refund transition table

`server/paymentReview.test.js` executes every cell below, including duplicate
delivery, financial state, provider POST count and notification count. Separate
barrier tests deliver processed/failed webhooks while reconciliation holds the
payment lock. The table has 180 admission/event cells and 30 in-flight API
completion cells. All provider IDs, payment IDs, currency, amounts and attempt
keys must validate; invalid evidence retains review or requests redelivery.

State names: NONE = PAID without a refund; REQUIRED = cancelled booking owed a
refund; PENDING = tracked, updated less than 15 minutes ago; STALE = tracked
PENDING updated at least 15 minutes ago; FAILED = confirmed app failure for a
cancelled booking; REVIEW = review of the app refund; OTHER = review caused by a
different dashboard refund; PROCESSED = terminal full refund. CREATED/OTHER-C
are unfulfilled CREATED payments reviewing the app/another refund respectively.

Results: K = keep the complete financial state and refund ID; P = PENDING;
F = FAILED; R = REVIEW; X = PROCESSED + REFUNDED; E = untracked full refund,
REFUNDED but still REVIEW; N = clear refund status via audited manual override.
Except X/E, preserve the payment's PAID/CREATED status and access entitlements.
Same/different IDs below refer to the tracked app attempt, not just its payment.

#### New request admission, followed by its API result

Only REQUIRED/eligible FAILED may claim an automatic retry. A pending claim,
review, active purchase or processed refund cannot start another provider POST.

| State | Pending | Processed | Failed | Rejected 4xx | Timeout/5xx |
| --- | --- | --- | --- | --- | --- |
| NONE | K | K | K | K | K |
| REQUIRED | P | X | F | F | R |
| PENDING | K | K | K | K | K |
| STALE | K | K | K | K | K |
| FAILED | P | X | F | F | R |
| REVIEW | K | K | K | K | K |
| OTHER | K | K | K | K | K |
| PROCESSED | K | K | K | K | K |
| CREATED | K | K | K | K | K |
| OTHER-C | K | K | K | K | K |

#### An already-issued API request completes after another event

The attempt key must still match. Terminal processed state cannot regress;
pending/rejected responses cannot erase a prior webhook failure or another
refund's review. These cells start one actual claimed request, change its
persisted state before returning the response, then complete that request.

| State at completion | Pending | Processed | Failed | Rejected 4xx | Timeout |
| --- | --- | --- | --- | --- | --- |
| PENDING | P | X | F | F | R |
| STALE | P | X | F | F | R |
| FAILED | F | X | F | F | F |
| REVIEW | R | X | F | R | R |
| OTHER | R | R | R | R | R |
| PROCESSED | X | X | X | X | X |

#### Signed refund webhooks

Same-ID terminal events may finalize the claimed refund, including before its
API response. A different ID with the same key cannot clear another refund's
REVIEW. The conditional write can succeed after a concurrent reconciliation has
committed that original ID; otherwise review stays intact or delivery retries.
An uncorrelated external partial refund always requires provider review.

| State | Same processed | Same failed | Different processed | Different failed | External partial |
| --- | --- | --- | --- | --- | --- |
| NONE | E | R | E | R | R |
| REQUIRED | E | R | E | R | R |
| PENDING | X | F | K | K | R |
| STALE | X | F | K | K | R |
| FAILED | X | F | K | K | R |
| REVIEW | X | F | K | K | R |
| OTHER | K | K | K | K | R |
| PROCESSED | K | K | K | K | K |
| CREATED | X | F | K | K | R |
| OTHER-C | K | K | K | K | R |

#### Authoritative provider reconciliation and manual resolution

OTHER can clear only after checking the refund that caused review: a matching
full outcome, or history showing that dashboard attempt failed and identifying
the original app attempt with no other non-failed refunds. A partial/non-failed
competing refund, mismatched amount/currency, missing correlation, conflicting
history or unavailable provider is not proof of failure. An old empty history
also requires a fresh captured payment with exactly zero refunded amount.

| State | Processed | Pending | Failed | Empty recent/undated | Empty after 24h | Provider error | Manual refunded | Manual no refund |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NONE | K | K | K | K | K | K | K | K |
| REQUIRED | K | K | K | K | K | K | K | K |
| PENDING | K | K | K | K | K | K | K | K |
| STALE | X | P | F | R | F | R | K | K |
| FAILED | K | K | K | K | K | K | K | K |
| REVIEW | X | P | F | R | F | R | X | N |
| OTHER | X | P | F | R | F | R | X | N |
| PROCESSED | K | K | K | K | K | K | K | K |
| CREATED | X | P | F | R | F | R | X | N |
| OTHER-C | X | P | F | R | F | R | X | N |

The empty-history F cell for a cancelled, already-paid booking instead resumes
REQUIRED through the existing claim path; a separate regression covers that
automatic refund. Missing/invalid provider evidence never makes that claim.

Notification accounting: a winning reconciliation/manual transition from any
non-PROCESSED state into PROCESSED sends one processed confirmation to each
distinct participant, after commit. Duplicate/concurrent checks send none extra.
Webhook callbacks do not resend initiation notices. A successful initiating API
request sends its single existing initiation email; failed/review outcomes do
not send a success email. These are separate messages, asserted separately in
the tables. Replaying a confirmed failed/rejected request can make a new attempt
with a new key (zero successful refunds); a timeout/pending/processed attempt
cannot. Best-effort notification delivery has no durable outbox: exactly-once
here means one dispatch per winning transition, not guaranteed email delivery
after a process crash or retry inside an external mail provider.
Support must monitor required/failed/review and old pending rows. Initiated refund
emails use existing Resend configuration; failed/skipped delivery does not roll
back financial state.

Unknown captured order IDs produce a structured reconciliation error and a
retryable 503 rather than silently acknowledging the payment. Booking alerts are
best-effort after settlement; financial processing is not retried because an
email or notification failed.

## Administrative consultation refunds

Admins can search the latest 100 matching payments in **Payments & Refunds** by
client email, lawyer name/ID or consultation ID, refresh webhook-driven states,
and issue a full refund for lawyer no-show, technical failure or another reviewed
reason. `POST /api/admin/consultations/:id/refund` requires ADMIN authentication,
one of `LAWYER_NO_SHOW`, `TECHNICAL_FAILURE`, `OTHER`, and a trimmed 10–500 character
note. It is limited to 10 requests per administrator per 15 minutes.

Only PAID consultation payments with no refund, REQUIRED or FAILED are claimable;
PENDING, PROCESSED and REVIEW return 409. Failed attempts can be retried, while
ambiguous REVIEW outcomes must be reconciled first. The existing atomic claim,
provider idempotency and webhook lifecycle are shared with client refunds.

The claim, consultation status and AdminAuditLog entry commit together before any
provider request. The audit action is `CONSULTATION_REFUND`; its `reason` field is
structured JSON containing reason, note, amount in paise, currency, payment ID and
consultation ID. Each accepted retry is audited. Notes stay administrative and
are not sent to either participant. Both participants get best-effort in-app and
opted-in email notifications, including when an accepted refund needs attention.

Upcoming consultations become CANCELLED. Started BOOKED/PENDING_PAYMENT records
become COMPLETED to close the appointment; this means its scheduling lifecycle is
closed, not that legal services were delivered. Already CANCELLED or COMPLETED
past records retain their status. Messages, documents and audit history remain.
Provider failure returns 502 without undoing the accepted status/audit decision.

## Support-only cases / decisions not implemented

- Lawyer no-show (policy 1.4) and technical disruption (2.1) require human evidence
  review. The approved admin tool issues full cash refunds only; automatic
  attendance decisions and document-credit compensation are not implemented.
- The 7-day unused document-credit refund was removed from the refund policy
  (product decision); document credits are not refundable. Provider-dashboard
  refunds are flagged for entitlement reconciliation rather than guessing which
  credits/access to revoke.
- Monthly subscriptions remain non-refundable after activation (3.2). No new
  percentages or cancellation windows have been invented.

## Provider references

- https://razorpay.com/docs/api/refunds/create-normal/ — singular endpoint,
  refund states, notes and `X-Refund-Idempotency` (supported in India).
- https://razorpay.com/docs/webhooks/refunds/ — refund event payloads.
- https://razorpay.com/docs/webhooks/payments/ — capture and order-paid semantics.

All automated provider requests use disposable local HTTP stubs configured via
`RAZORPAY_API_URL`; no live charge or refund was made.
