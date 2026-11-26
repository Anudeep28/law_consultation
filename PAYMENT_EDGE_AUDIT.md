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
  new refund. Processed/failed webhooks finish it; monitor old pending rows for
  reconciliation if the initiating process died or webhooks are unavailable.
- `FAILED`: explicit provider rejection or a matching failed webhook. The owning
  client's cancellation endpoint can retry; a captured event replay can also
  resume an eligible failed refund. Each confirmed-failed attempt gets a new ID.
- `REVIEW`: ambiguous network/5xx response, unexpected provider response,
  mismatched capture, or provider-dashboard refund outside tracked attempts.
  This is deliberately not automatically retried with a new key. Reconcile with
  Razorpay first to avoid refunding twice. The payment row retains the attempt ID;
  any retry of an ambiguous request must use that original
  `X-Refund-Idempotency` key and identical amount/notes body. Do not reset state
  merely because an API response was lost.
- `PROCESSED`: the full matching refund is processed; payment status is REFUNDED.

Cancellation is committed independently of provider availability so a refund
failure cannot lose eligibility when the scheduled start passes. Financial
failures return a support/retry error, and a durable state remains. A second
cancellation is idempotent while a refund is pending, processed or under review.
There is no automatic reconciliation scheduler.
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
