-- CreateEnum
CREATE TYPE "ConsultationPackage" AS ENUM ('CALL_ONLY', 'CALL_WITH_DOCUMENT');

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "package" "ConsultationPackage" NOT NULL DEFAULT 'CALL_ONLY';

-- AlterTable
ALTER TABLE "Lawyer" ADD COLUMN     "documentFeePercent" INTEGER NOT NULL DEFAULT 50;
