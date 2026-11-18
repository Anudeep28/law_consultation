import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const bcrypt = require('bcrypt');
const { databaseUrl, fixturesPath } = require('./runtime.cjs');

export default async function globalSetup() {
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    stdio: 'inherit', env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  const prisma = new PrismaClient();
  const run = randomUUID();
  const password = `E2e-${randomUUID()}`;
  const passwordHash = await bcrypt.hash(password, 12);
  const fixtures: Record<string, unknown> = { password };
  try {
    for (const label of ['client', 'dismissClient', 'tamperClient', 'bookingLawyer', 'monthlyLawyer', 'singleLawyer']) {
      const user = await prisma.user.create({ data: {
        email: `${label.toLowerCase()}-${run}@example.test`, name: `E2E ${label} ${run}`,
        passwordHash, role: label.includes('Client') || label === 'client' ? 'CLIENT' : 'LAWYER',
        accountStatus: 'ACTIVE', emailVerifiedAt: new Date(), phoneVerifiedAt: new Date(),
        subscriptionPlan: 'TRIAL', subscriptionExpiry: new Date(Date.now() + 2 * 86400_000),
        emailNotifications: false, pushNotifications: false,
      } });
      fixtures[label] = { id: user.id, email: user.email };
      if (label === 'bookingLawyer') {
        const lawyer = await prisma.lawyer.create({ data: {
          userId: user.id, slug: `e2e-${run}`, name: user.name, title: 'E2E Advocate',
          bio: 'An isolated test lawyer for deterministic payment booking scenarios.',
          practiceAreas: ['Contracts'], languages: ['English'], experienceYears: 5,
          barCouncil: 'Test Bar Council', enrollmentNumber: `E2E/${run}/2020`,
          fee: 25000, rating: 5, reviewCount: 0, isVerified: true, approvalStatus: 'APPROVED',
          availability: { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:50' },
        } });
        fixtures.lawyer = { id: lawyer.id, name: lawyer.name };
      }
    }
    mkdirSync(path.dirname(fixturesPath), { recursive: true });
    writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2), { mode: 0o600 });
  } finally {
    await prisma.$disconnect();
  }
}
