/**
 * Creates or updates a panel_users row from environment variables.
 * Run this once to set up credentials, then manage them directly in Supabase.
 *
 * Usage:
 *   SEED_USERNAME=admin SEED_PASSWORD=yourpassword \
 *     npx ts-node -r tsconfig-paths/register scripts/seed-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

async function main(): Promise<void> {
  const username = process.env.SEED_USERNAME;
  const password = process.env.SEED_PASSWORD;

  if (!username || !password) {
    console.error('ERROR: SEED_USERNAME and SEED_PASSWORD must be set.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ERROR: SEED_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.panelUser.upsert({
      where: { username },
      update: { passwordHash },
      create: { username, passwordHash },
    });
    console.log(`✓ Panel user "${username}" saved.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Failed:', err);
  process.exit(1);
});
