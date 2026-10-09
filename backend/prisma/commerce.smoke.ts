import 'reflect-metadata';
import { strict as assert } from 'assert';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID, createHmac } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

function parseMysqlUrl(url: string) {
  const m = /^mysql:\/\/([^:]+):([^@]*)@([^/:]+)(?::(\d+))?\/([^?]+)/.exec(url);
  if (!m) throw new Error('commerce.smoke requires a MySQL DATABASE_URL in the form mysql://user:pass@host:port/db');
  const [, user, password, host, port, database] = m;
  return { user, password, host, port: port ? Number(port) : 3306, database };
}

async function adminMysql(baseUrl: string, sql: string) {
  const { host, port, user, password } = parseMysqlUrl(baseUrl);
  const mysql = await import('mysql2/promise');
  const conn = await mysql.createConnection({ host, port, user, password, multipleStatements: true });
  try { await conn.query(sql); } finally { await conn.end(); }
}

async function main() {
  const baseUrl = process.env.DATABASE_URL || '';
  if (!/^mysql:\/\//.test(baseUrl)) throw new Error('DATABASE_URL must start with mysql:// for smoke test');
  const { database } = parseMysqlUrl(baseUrl);
  const suffix = randomUUID().replace(/-/g, '').slice(0, 16);
  const testDb = `smoke_${database.slice(0, 40)}_${suffix}`;
  const dbUrl = baseUrl.replace(`/${database}`, `/${testDb}`);
  process.env.DATABASE_URL = dbUrl;
  process.env.APP_ENV = 'test';
  process.env.NODE_ENV = 'test';
  process.env.REDIS_HOST = 'none';
  process.env.RESEND_API_KEY = '';
  process.env.STRIPE_SECRET_KEY = '';
  process.env.COMMERCE_LIVE_ENABLED = 'false';

  await adminMysql(baseUrl, `CREATE DATABASE \`${testDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);

  const db = new PrismaClient();
  let app: any;
  let checks = 0;
  function check(condition: unknown, name: string) { assert.ok(condition, name); console.log(`PASS ${++checks}: ${name}`); }
  try {
    for (const dir of readdirSync(join(__dirname, 'migrations')).filter(d => /^\d/.test(d)).sort()) {
      const sql = readFileSync(join(__dirname, 'migrations', dir, 'migration.sql'), 'utf8');
      for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) {
        try { await db.$executeRawUnsafe(statement); }
        catch (e) { console.error('MIGRATION FAILED:', statement); throw e; }
      }
    }
    const { AppModule } = await import('../src/app.module');
    const { CommerceService } = await import('../src/core/commerce/commerce.service');
    const { CommerceConfig } = await import('../src/core/commerce/commerce.config');
    const { CommercePayments } = await import('../src/core/commerce/commerce.payments');
    app = await NestFactory.create(AppModule, { logger: false, rawBody: true });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const admin = await db.user.create({ data: { email: 'admin@smoke.invalid', passwordHash: await bcrypt.hash('AdminSmoke123!', 10), isAdmin: true } });
    async function request(path: string, method = 'GET', data?: any, headers: Record<string, string> = {}, status = 200) {
      const res = await fetch(`${base}/api${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
      const txt = await res.text();
      let body: any; try { body = JSON.parse(txt); } catch { body = txt; }
      assert.equal(res.status, status, `${method} ${path}: status=${res.status} body=${JSON.stringify(body)}`);
      return body;
    }
    const adminLogin = await request('/auth/login', 'POST', { email: admin.email, password: 'AdminSmoke123!' });
    const ah = { Authorization: `Bearer ${adminLogin.data.token}` };
    const registered = await request('/auth/register', 'POST', { email: 'customer@smoke.invalid', password: 'CustomerSmoke123!', fullName: 'Smoke Customer' }, {}, 201);
    const uh = { Authorization: `Bearer ${registered.data.token}` };
    check(registered.data.user.email === 'customer@smoke.invalid', 'Registration and login');
    await request('/store/admin/products', 'GET', undefined, {}, 401);
    await request('/store/admin/products', 'GET', undefined, uh, 403);
    check(true, 'Anonymous and non-admin callers cannot operate admin APIs');
    const productInput = { slug: 'smoke-item', name: 'Smoke item', category: 'non-powered', description: 'Demonstration listing for test only',
      material: '', dimensions: '', care: '', images: [], demo: true, active: true, featured: true,
      variants: [{ sku: 'SMOKE-1', label: 'Standard', price: 3800, stock: 20, active: true }] };
    const product = await request('/store/admin/products', 'POST', productInput, ah, 201);
    const variant = product.variants[0];
    await request('/store/admin/products', 'POST', { ...productInput, slug: 'invalid-real', demo: false }, ah, 400);
    check((await request('/store/products')).length === 1, 'Catalog works; incomplete real products cannot be published');
    await request('/store/admin/coupons', 'POST', { code: 'SMOKE10', percent: 10, minimum: 0, active: true }, ah, 201);
    const items = [{ variantId: variant.id, quantity: 2 }];
    const q = await request('/store/quote', 'POST', { items, coupon: 'SMOKE10' }, {}, 201);
    check(q.subtotal === 7600 && q.discount === 760 && q.shipping === 695 && q.total === 7535, 'Integer cents, coupon and shipping calculated on server');
    await request('/store/quote', 'POST', { items: [{ variantId: variant.id, quantity: 0 }] }, {}, 400);
    await request('/store/quote', 'POST', { items, total: 1 }, {}, 400);
    await request('/store/quote', 'POST', { items, coupon: 'INVALID' }, {}, 400);
    check(true, 'Malformed quantities, injected prices and invalid coupons rejected');
    const input = { items, coupon: 'SMOKE10', email: 'guest@smoke.invalid', address: { name: 'Test Guest', line1: '100 Test Street', city: 'Los Angeles', state: 'CA', zip: '90001', country: 'US' }, adult: true, terms: true, idempotencyKey: randomUUID() };
    await request('/store/checkout', 'POST', { ...input, address: { ...input.address, state: 'HI' } }, {}, 400);
    await request('/store/checkout', 'POST', { ...input, adult: false }, {}, 400);
    const created = await request('/store/checkout', 'POST', input, {}, 201);
    const access = { 'x-order-token': created.accessToken };
    const again = await request('/store/checkout', 'POST', input, {}, 201);
    check(again.id === created.id && (await db.storeVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock === 18, 'Guest checkout is idempotent; inventory reserved only once');
    await request(`/store/orders/${created.id}`, 'GET', undefined, {}, 404);
    await request(`/store/orders/${created.id}`, 'GET', undefined, uh, 404);
    const order = await request(`/store/orders/${created.id}`, 'GET', undefined, access);
    check(!order.accessHash && order.email === input.email, 'Guest access requires private token; no token hashes leak');
    await request(`/store/admin/products/${product.id}`, 'PUT', { ...productInput, variants: [{ ...productInput.variants[0], id: variant.id, version: 0 }] }, ah, 409);
    check(true, 'Stale admin inventory edit rejected');
    const service = app.get(CommerceService);
    await assert.rejects(() => (service as any).settle(created.id, 1, 'usd', 'bad', 'bad'));
    await request('/store/webhook/stripe', 'POST', {}, {}, 400);
    check(true, 'Wrong payment amount and unsigned webhook rejected');
    await request(`/store/orders/${created.id}/mock-pay`, 'POST', {}, access, 201);
    const duplicate = await request(`/store/orders/${created.id}/mock-pay`, 'POST', {}, access, 201);
    check(duplicate.duplicate && (await db.storeVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock === 18, 'Duplicate payment is idempotent');
    await request(`/store/admin/orders/${created.id}/ship`, 'POST', { carrier: 'USPS', trackingNumber: 'SMOKE12345' }, ah, 201);
    await request(`/store/admin/orders/${created.id}/ship`, 'POST', { carrier: 'USPS', trackingNumber: 'SMOKE12345' }, ah, 400);
    await request(`/store/orders/${created.id}/returns`, 'POST', { reason: 'Please review this test return request.' }, access, 201);
    await request(`/store/admin/orders/${created.id}/return`, 'PUT', { status: 'approved', note: 'Return approved for inspection.' }, ah);
    await request(`/store/admin/orders/${created.id}/refund`, 'POST', { reference: 'demo-refund-1', restock: true }, ah, 400);
    await request(`/store/admin/orders/${created.id}/return`, 'PUT', { status: 'received', note: 'Goods inspected and received.' }, ah);
    await request(`/store/admin/orders/${created.id}/refund`, 'POST', { reference: 'demo-refund-1', restock: true }, ah, 201);
    await request(`/store/admin/orders/${created.id}/refund`, 'POST', { reference: 'demo-refund-1', restock: true }, ah, 400);
    check((await db.storeVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock === 20, 'Dispatch, return, refund and restock workflow; no duplicate restock');
    const second = await request('/store/checkout', 'POST', { ...input, idempotencyKey: randomUUID() }, uh, 201);
    check((await request('/store/my-orders', 'GET', undefined, uh)).some((o: any) => o.id === second.id), 'Account order ownership and listing');
    await db.storeOrder.update({ where: { id: second.id }, data: { expiresAt: new Date(Date.now() - 60000) } });
    await service.expire(); await service.expire();
    check((await db.storeVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock === 20, 'Expired reservations released exactly once');
    await (service as any).settle(second.id, 7535, 'usd', 'late-session', 'late-intent');
    check((await db.storeOrder.findUniqueOrThrow({ where: { id: second.id } })).paymentStatus === 'payment_review', 'Late payment enters manual review instead of shipping unreserved goods');
    const cancellation = await request('/store/checkout', 'POST', { ...input, idempotencyKey: randomUUID() }, {}, 201);
    await request(`/store/orders/${cancellation.id}/cancel`, 'POST', {}, { 'x-order-token': cancellation.accessToken }, 201);
    check((await db.storeVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock === 20, 'Cancellation releases inventory');
    const recovered = await request('/store/recover', 'POST', { number: order.number, email: input.email }, {}, 201);
    const missing = await request('/store/recover', 'POST', { number: 'MISSING', email: input.email }, {}, 201);
    check(recovered.message === missing.message && await db.storeMail.count({ where: { eventKey: { startsWith: 'access-' } } }) === 1, 'Order recovery is silent and emails a private link');
    await request('/auth/request-reset', 'POST', { email: registered.data.user.email });
    const resetMail = await db.storeMail.findFirstOrThrow({ where: { eventKey: { startsWith: 'reset:' } } });
    const code = resetMail.text.match(/\b\d{6}\b/)![0];
    await request('/auth/reset-password', 'POST', { email: registered.data.user.email, code, newPassword: 'ChangedSmoke123!' });
    await request('/auth/reset-password', 'POST', { email: registered.data.user.email, code, newPassword: 'ChangedSmoke123!' }, {}, 400);
    await request('/auth/login', 'POST', { email: registered.data.user.email, password: 'ChangedSmoke123!' });
    check(true, 'Password reset outbox and single-use reset codes');
    const cfg = app.get(ConfigService);
    cfg.set('APP_ENV', 'production');
    cfg.set('COMMERCE_LIVE_ENABLED', 'false');
    await request(`/store/orders/${created.id}/mock-pay`, 'POST', {}, access, 404);
    await request('/store/checkout', 'POST', { ...input, idempotencyKey: randomUUID() }, {}, 503);
    check(true, 'Production blocks mock payments and unapproved checkout');
    cfg.set('STRIPE_SECRET_KEY', 'sk_test_not_real');
    cfg.set('STRIPE_WEBHOOK_SECRET', 'whsec_smoke_secret');
    cfg.set('COMMERCE_LIVE_ENABLED', 'true');
    const settings = app.get(CommerceConfig);
    const payment = new CommercePayments(cfg, settings);
    const payload = JSON.stringify({ id: 'evt_smoke', type: 'checkout.session.completed', data: { object: { id: 'cs_smoke' } } });
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', 'whsec_smoke_secret').update(`${timestamp}.${payload}`).digest('hex');
    check(payment.parse(Buffer.from(payload), `t=${timestamp},v1=${sig}`).id === 'evt_smoke', 'Stripe adapter verifies authentic signed payload');
    assert.throws(() => payment.parse(Buffer.from(payload), 'bad'));
    check((await service.catalog()).length === 0, 'Live catalog excludes demonstration products');
    cfg.set('APP_ENV', 'test'); cfg.set('COMMERCE_LIVE_ENABLED', 'false');
    await db.user.update({ where: { id: admin.id }, data: { isAdmin: false } });
    await request('/store/admin/orders', 'GET', undefined, ah, 403);
    check(true, 'Admin permission checked against database, not stale JWT claims');
    check(await db.adminAuditLog.count() >= 6 && await db.storeMail.count() >= 5, 'Operations audited and transactional emails persisted');
    console.log(`\n${checks} commerce checks passed against isolated MySQL database ${testDb}.`);
  } finally {
    if (app) await app.close();
    await db.$disconnect();
    try { await adminMysql(baseUrl, `DROP DATABASE IF EXISTS \`${testDb}\`;`); } catch { /* ignore cleanup errors */ }
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
