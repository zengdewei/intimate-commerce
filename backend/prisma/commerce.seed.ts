import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const db = new PrismaClient();
async function seed() {
  const production = process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (production && (!process.env.ADMIN_EMAIL || (process.env.ADMIN_PASSWORD || '').length < 14)) {
    throw new Error('Production seed requires ADMIN_EMAIL and a unique ADMIN_PASSWORD (14+ characters)');
  }
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@123456';
  await db.user.upsert({
    where: { email }, update: {},
    create: { email, passwordHash: await bcrypt.hash(password, 12), fullName: 'Store administrator', isAdmin: true },
  });
  if (production) {
    console.log('Administrator initialized. No demonstration products or accounts were created.');
    return;
  }
  await db.user.upsert({
    where: { email: 'test@example.com' }, update: {},
    create: { email: 'test@example.com', passwordHash: await bcrypt.hash('Test@123456', 12), fullName: 'Demo customer' },
  });
  const products = [
    { slug: 'the-everyday-edit', name: 'The Everyday Edit', category: 'non-powered', price: 3800, label: 'Rose / Standard' },
    { slug: 'the-soft-curve', name: 'The Soft Curve', category: 'non-powered', price: 4600, label: 'Clay / Standard' },
    { slug: 'the-personal-wand', name: 'The Personal Wand', category: 'powered', price: 6800, label: 'Plum / Standard' },
    { slug: 'the-pocket-companion', name: 'The Pocket Companion', category: 'powered', price: 4200, label: 'Blush / Standard' },
  ];
  for (const [i, p] of products.entries()) {
    const { price, label, ...data } = p;
    await db.storeProduct.upsert({
      where: { slug: p.slug }, update: {},
      create: {
        ...data,
        description: 'Demonstration listing for testing the shopping experience. Product photography, specifications and final pricing are not yet supplied. Not available for real purchase.',
        material: '', dimensions: '', care: '', images: '[]',
        active: true, demo: true, featured: i < 2,
        variants: { create: { sku: `DEMO-${i + 1}`, label, price, stock: 20 } },
      },
    });
  }
  await db.storeCoupon.upsert({ where: { code: 'PREVIEW10' }, update: {}, create: { code: 'PREVIEW10', percent: 10 } });
  console.log('Preview ready: 4 demonstration products. Admin: admin@example.com / Admin@123456. Customer: test@example.com / Test@123456.');
}
seed().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
