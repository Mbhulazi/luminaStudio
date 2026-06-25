/**
 * Seeds the database with a single super admin account.
 * Run with: node prisma/seed.js
 * (after `npx prisma migrate dev` has created the schema)
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@luminastudio.art';
  const password = process.env.SEED_ADMIN_PASSWORD || 'change-me-immediately';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin account ${email} already exists — skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      name: 'Lummina Admin',
      email,
      passwordHash,
      tier: 'master',
      role: 'admin',
    },
  });
  console.log(`Created super admin account: ${email}`);
  console.log('Log in once and change this password immediately — it is stored in plain text in your shell history right now.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
