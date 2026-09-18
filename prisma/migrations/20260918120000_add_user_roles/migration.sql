CREATE TYPE "UserRole" AS ENUM ('CLIENT', 'LAWYER');

ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'CLIENT';
ALTER TABLE "Lawyer" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "Lawyer_userId_key" ON "Lawyer"("userId");
CREATE UNIQUE INDEX "Lawyer_enrollmentNumber_key" ON "Lawyer"("enrollmentNumber");
ALTER TABLE "Lawyer" ADD CONSTRAINT "Lawyer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
