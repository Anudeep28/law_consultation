-- AlterEnum
ALTER TYPE "ConsultationStatus" ADD VALUE 'PENDING_PAYMENT' BEFORE 'BOOKED';

-- AlterEnum
ALTER TYPE "SubscriptionPlan" ADD VALUE 'CONSULTATION';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "consultationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_consultationId_key" ON "Payment"("consultationId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
