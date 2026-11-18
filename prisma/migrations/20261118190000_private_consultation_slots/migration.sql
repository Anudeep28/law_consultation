BEGIN;

DROP INDEX "Consultation_lawyerId_startsAt_key";

CREATE UNIQUE INDEX "Consultation_active_lawyerId_startsAt_key"
ON "Consultation"("lawyerId", "startsAt")
WHERE "status" IN ('PENDING_PAYMENT', 'BOOKED', 'COMPLETED');

CREATE INDEX "Consultation_lawyerId_startsAt_idx" ON "Consultation"("lawyerId", "startsAt");

COMMIT;
