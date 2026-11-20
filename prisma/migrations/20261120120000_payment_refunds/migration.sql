CREATE TYPE "RefundStatus" AS ENUM ('REQUIRED', 'PENDING', 'PROCESSED', 'FAILED', 'REVIEW');
ALTER TABLE "Payment"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN "refundId" TEXT,
  ADD COLUMN "refundStatus" "RefundStatus",
  ADD COLUMN "refundError" TEXT,
  ADD COLUMN "refundRequestedAt" TIMESTAMP(3),
  ADD COLUMN "refundAttemptId" TEXT;
CREATE UNIQUE INDEX "Payment_refundId_key" ON "Payment"("refundId");
