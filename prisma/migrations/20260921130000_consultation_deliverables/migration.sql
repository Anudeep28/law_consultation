-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN "transcript" TEXT;

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('DRAFT', 'DELIVERED');

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "documentId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" "DeliverableStatus" NOT NULL DEFAULT 'DRAFT',
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deliverable_consultationId_idx" ON "Deliverable"("consultationId");

-- CreateIndex
CREATE UNIQUE INDEX "Deliverable_documentId_key" ON "Deliverable"("documentId");

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
