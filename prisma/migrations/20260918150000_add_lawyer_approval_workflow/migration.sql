ALTER TYPE "UserRole" ADD VALUE 'ADMIN';

CREATE TYPE "LawyerApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Lawyer"
ADD COLUMN "approvalStatus" "LawyerApprovalStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "rejectionReason" TEXT;

UPDATE "Lawyer"
SET "approvalStatus" = CASE WHEN "isVerified" THEN 'APPROVED'::"LawyerApprovalStatus" ELSE 'DRAFT'::"LawyerApprovalStatus" END;
