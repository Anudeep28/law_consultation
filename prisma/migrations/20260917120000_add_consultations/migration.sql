CREATE TYPE "ConsultationStatus" AS ENUM ('BOOKED', 'CANCELLED', 'COMPLETED');

CREATE TABLE "Lawyer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "practiceAreas" TEXT[],
    "languages" TEXT[],
    "experienceYears" INTEGER NOT NULL,
    "barCouncil" TEXT NOT NULL,
    "enrollmentNumber" TEXT NOT NULL,
    "fee" INTEGER NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "reviewCount" INTEGER NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "availability" JSONB NOT NULL,

    CONSTRAINT "Lawyer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lawyerId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "topic" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'BOOKED',
    "meetingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Lawyer_slug_key" ON "Lawyer"("slug");
CREATE UNIQUE INDEX "Consultation_lawyerId_startsAt_key" ON "Consultation"("lawyerId", "startsAt");
CREATE INDEX "Consultation_userId_startsAt_idx" ON "Consultation"("userId", "startsAt");

ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "Lawyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Lawyer" ("id", "slug", "name", "title", "bio", "practiceAreas", "languages", "experienceYears", "barCouncil", "enrollmentNumber", "fee", "rating", "reviewCount", "isVerified", "availability") VALUES
('lawyer_ananya_sharma', 'ananya-sharma', 'Adv. Ananya Sharma', 'Family & Matrimonial Lawyer', 'Advises individuals on divorce, maintenance, custody, domestic violence, and family settlements with a practical and empathetic approach.', ARRAY['Family Law', 'Divorce', 'Child Custody'], ARRAY['English', 'Hindi'], 12, 'Bar Council of Delhi', 'D/2451/2014', 49900, 4.9, 184, true, '{"days":[1,2,3,4,5],"start":"04:30","end":"08:30"}'),
('lawyer_rohan_mehta', 'rohan-mehta', 'Adv. Rohan Mehta', 'Corporate & Startup Counsel', 'Helps founders and small businesses with contracts, company matters, employment issues, and commercial disputes.', ARRAY['Corporate Law', 'Contracts', 'Startups'], ARRAY['English', 'Hindi', 'Gujarati'], 9, 'Bar Council of Maharashtra & Goa', 'MAH/3187/2017', 59900, 4.8, 126, true, '{"days":[1,2,3,4,5,6],"start":"09:30","end":"13:30"}'),
('lawyer_priya_iyer', 'priya-iyer', 'Adv. Priya Iyer', 'Property & Civil Disputes Lawyer', 'Handles property documentation, landlord-tenant questions, inheritance matters, and civil dispute strategy.', ARRAY['Property Law', 'Civil Law', 'Inheritance'], ARRAY['English', 'Hindi', 'Tamil'], 15, 'Bar Council of Tamil Nadu & Puducherry', 'MS/1928/2011', 64900, 4.9, 231, true, '{"days":[1,2,3,4,5],"start":"05:30","end":"10:30"}'),
('lawyer_arjun_singh', 'arjun-singh', 'Adv. Arjun Singh', 'Criminal Defence Lawyer', 'Provides preliminary guidance on bail, FIRs, criminal complaints, cybercrime, and procedural next steps.', ARRAY['Criminal Law', 'Bail', 'Cybercrime'], ARRAY['English', 'Hindi', 'Punjabi'], 11, 'Bar Council of Punjab & Haryana', 'P/2644/2015', 54900, 4.7, 98, true, '{"days":[1,2,3,4,5,6],"start":"03:30","end":"07:30"}');
