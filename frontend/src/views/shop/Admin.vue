<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import api from '@/lib/axios';
import { money, errorMessage, categoryName } from '@/stores/shop';
const tab = ref('overview');
const products = ref<any[]>([]);
const orders = ref<any[]>([]);
const coupons = ref<any[]>([]);
const health = ref<any>(null);
const editing = ref<any>(null);
const imageUrls = ref('');
const error = ref('');
const success = ref('');
const busy = ref(false);
const orderFilter = ref('all');
const orderFulfillment = ref('all');
const orderSort = ref<'dateDesc' | 'dateAsc' | 'totalDesc' | 'totalAsc'>('dateDesc');
const variantConflict = ref(false);
const imagePreviewError = reactive<Record<number, boolean>>({});
const filtered = computed(() => {
  let list = orders.value.filter(o => {
    const paymentOk = orderFilter.value === 'all' ||
      (orderFilter.value === 'after-sales' ? !!o.returns.length : o.paymentStatus === orderFilter.value);
    const fulfillOk = orderFulfillment.value === 'all' || o.fulfillmentStatus === orderFulfillment.value;
    return paymentOk && fulfillOk;
  });
  list = [...list].sort((a, b) => {
    switch (orderSort.value) {
      case 'dateAsc': return +new Date(a.createdAt) - +new Date(b.createdAt);
      case 'totalDesc': return b.total - a.total;
      case 'totalAsc': return a.total - b.total;
      default: return +new Date(b.createdAt) - +new Date(a.createdAt);
    }
  });
  return list;
});
const imageRows = computed(() => imageUrls.value.split('\n').map(line => line.trim()));
function imageValid(url: string) {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch { return false; }
}
const shipment = reactive<Record<string, { carrier: string; trackingNumber: string }>>({});
const refunds = reactive<Record<string, { reference: string; restock: boolean }>>({});
const returns = reactive<Record<string, { status: string; note: string }>>({});
const coupon = reactive({ code: '', percent: 10, minimum: 0, active: true, expiresAt: '' });
async function load() {
  const [p, o, c, h] = await Promise.all(['products', 'orders', 'coupons', 'health'].map(s => api.get(`/store/admin/${s}`)));
  products.value = p.data; orders.value = o.data; coupons.value = c.data; health.value = h.data;
  for (const order of orders.value) {
    shipment[order.id] ||= { carrier: 'USPS', trackingNumber: '' };
    refunds[order.id] ||= { reference: '', restock: false };
    returns[order.id] = { status: order.returns[0]?.status === 'approved' ? 'received' : 'approved', note: '' };
  }
}
async function run(task: () => Promise<any>, message: string) {
  busy.value = true; error.value = ''; success.value = ''; variantConflict.value = false;
  try { await task(); await load(); success.value = message; }
  catch (e) {
    const msg = errorMessage(e);
    error.value = msg;
    if (/Inventory changed while editing/i.test(msg)) variantConflict.value = true;
  }
  finally { busy.value = false; }
}
onMounted(() => run(async () => {}, ''));
function edit(p?: any) {
  editing.value = p ? JSON.parse(JSON.stringify(p)) : { slug: '', name: '', category: 'non-powered', description: '', material: '', dimensions: '', care: '', demo: true, active: false, featured: false, variants: [{ sku: '', label: 'Standard', price: 1000, stock: 0, active: true }] };
  imageUrls.value = p?.images.join('\n') || '';
  success.value = ''; error.value = ''; variantConflict.value = false;
  Object.keys(imagePreviewError).forEach(k => delete imagePreviewError[Number(k)]);
}
async function saveProduct() {
  const p = editing.value;
  const images = imageUrls.value.split('\n').map(s => s.trim()).filter(Boolean);
  for (const u of images) if (!imageValid(u)) { error.value = 'Image URLs must use HTTPS.'; return; }
  if (images.length > 8) { error.value = 'Maximum 8 images per product.'; return; }
  const data = {
    slug: p.slug, name: p.name, category: p.category, description: p.description, material: p.material, dimensions: p.dimensions,
    care: p.care, demo: p.demo, active: p.active, featured: p.featured,
    images,
    variants: p.variants.map((v: any) => ({ ...(v.id ? { id: v.id, version: v.version } : {}), sku: v.sku, label: v.label, price: v.price, stock: v.stock, active: v.active })),
  };
  await run(async () => {
    if (p.id) await api.put(`/store/admin/products/${p.id}`, data); else await api.post('/store/admin/products', data);
    editing.value = null;
  }, 'Product saved.');
}
async function saveCoupon() {
  await run(() => api.post('/store/admin/coupons', { ...coupon, code: coupon.code.toUpperCase(), expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString() : undefined }), 'Discount code saved.');
}
function onImageError(idx: number) { imagePreviewError[idx] = true; }
</script>
<template>
  <section class="section-wrap admin-page"><div class="section-heading"><div><p class="eyebrow">OPERATIONS</p><h1>Store management.</h1></div><RouterLink class="button secondary" to="/shop">View storefront</RouterLink></div><div class="filter-tabs account-tabs"><button v-for="t in ['overview', 'products', 'orders', 'coupons']" :key="t" :class="{ selected: tab === t }" @click="tab = t">{{ t }}</button><button :disabled="busy" @click="run(async () => {}, 'Updated.')">Refresh</button></div><p v-if="error" class="notice error" role="alert">{{ error }}</p><p v-if="success" class="notice success" role="status">{{ success }}</p><p v-if="busy">Working...</p>
    <template v-if="tab === 'overview' && health"><div class="metrics-grid"><div><span>Payment mode</span><strong>{{ health.demo ? 'Preview' : 'Live' }}</strong></div><div><span>Payment review</span><strong>{{ health.paymentReview }}</strong></div><div><span>Pending emails</span><strong>{{ health.pendingEmails }}</strong></div><div><span>Failed emails</span><strong>{{ health.failedEmails }}</strong></div></div><div class="notice"><h3>Launch checklist</h3><p>Confirm actual products and photography, payment-category approval, support email, shipping and returns, privacy and terms, compliance review, production hosting and backups.</p><p>{{ health.demoProducts }} demonstration products exist. They are hidden when live sales are enabled.</p><p>Store settings and launch gates are configured on the server. See <code>docs/COMMERCE_MVP.md</code>.</p><p>Sales tax is not calculated. This is not an exemption determination.</p></div></template>
    <template v-if="tab === 'products'"><div class="section-heading"><h2>Catalog & available stock</h2><button class="button primary" @click="edit()">Add product</button></div>
      <form v-if="editing" class="admin-editor" @submit.prevent="saveProduct"><div class="section-heading"><h2>{{ editing.id ? 'Edit product' : 'New product' }}</h2><button type="button" class="text-link" @click="editing = null">Close editor</button></div><div class="form-grid"><label class="field">Name<input v-model="editing.name" required minlength="2" maxlength="150"></label><label class="field">URL slug<input v-model="editing.slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="100"></label><label class="field">Category<select v-model="editing.category"><option value="non-powered">Non-powered essentials</option><option value="powered">Powered pleasure</option></select></label><div class="check-group"><label class="checkbox-field"><input v-model="editing.active" type="checkbox">Published</label><label class="checkbox-field"><input v-model="editing.demo" type="checkbox">Demonstration only</label><label class="checkbox-field"><input v-model="editing.featured" type="checkbox">Featured</label></div></div><label class="field">Description<textarea v-model="editing.description" required minlength="10" maxlength="5000" rows="3"></textarea></label><div class="form-grid"><label class="field">Verified material<textarea v-model="editing.material" maxlength="1000"></textarea></label><label class="field">Dimensions<textarea v-model="editing.dimensions" maxlength="1000"></textarea></label></div><label class="field">Care instructions<textarea v-model="editing.care" maxlength="2000"></textarea></label>
        <label class="field">Image URLs (HTTPS, one per line, up to 8)<textarea v-model="imageUrls" rows="4" :class="{ invalid: imageRows.some(u => u && !imageValid(u)) || imageRows.filter(Boolean).length > 8 }"></textarea><small>Only use product images you own or are authorized to publish. Real listings require verified product information.</small>
          <div v-if="imageRows.filter(Boolean).length" class="image-preview-grid">
            <figure v-for="(u, idx) in imageRows.filter(Boolean)" :key="idx" :class="{ broken: !imageValid(u) || imagePreviewError[idx] }">
              <img v-if="imageValid(u) && !imagePreviewError[idx]" :src="u" :alt="`Preview ${idx + 1}`" loading="lazy" @error="onImageError(idx)">
              <figcaption>
                <span v-if="!imageValid(u)" class="pill warn">HTTPS required</span>
                <span v-else-if="imagePreviewError[idx]" class="pill warn">Unavailable</span>
                <span v-else class="pill ok">Preview {{ idx + 1 }}</span>
                <code>{{ u.length > 70 ? u.slice(0, 70) + '…' : u }}</code>
              </figcaption>
            </figure>
          </div>
        </label>
        <h3>Variants</h3>
        <p v-if="variantConflict" class="notice error" role="alert">Inventory or pricing was updated by another operator while you were editing. <button type="button" class="text-link" @click="edit(products.find(x => x.id === editing.id)); error = ''">Reload this product</button> and re-apply your changes.</p>
        <p class="fine-print">Prices are in cents (3800 = $38.00). Stock is currently available stock, excluding reserved units. Refresh before editing inventory.</p>
        <div v-for="(v, i) in editing.variants" :key="v.id || i" class="variant-editor" :class="{ 'row-conflict': variantConflict && v.id }">
          <label class="field">SKU<input v-model="v.sku" required pattern="[A-Za-z0-9_-]{2,60}"></label>
          <label class="field">Option<input v-model="v.label" required></label>
          <label class="field">Price (cents)<input v-model.number="v.price" type="number" required min="1" max="1000000"></label>
          <label class="field">Available stock<input v-model.number="v.stock" type="number" required min="0" max="1000000"></label>
          <label class="checkbox-field"><input v-model="v.active" type="checkbox">Active</label>
          <small v-if="variantConflict && v.id" class="row-hint">Reload to pick up latest version before saving.</small>
        </div>
        <div class="button-row"><button type="button" class="button secondary" @click="editing.variants.push({ sku: '', label: '', price: 1000, stock: 0, active: true })">Add option</button><button class="button primary" :disabled="busy">Save product</button></div>
      </form>
      <div class="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Status</th><th>Options / Available</th><th></th></tr></thead><tbody><tr v-for="p in products" :key="p.id"><td><strong>{{ p.name }}</strong><small>{{ p.slug }}</small></td><td>{{ categoryName(p.category) }}</td><td>{{ p.active ? 'Published' : 'Draft' }}{{ p.demo ? ' · Demo' : '' }}</td><td>{{ p.variants.length }} / {{ p.variants.reduce((n: number, v: any) => n + v.stock, 0) }}</td><td><button class="text-link" @click="edit(p)">Edit</button></td></tr></tbody></table></div></template>
    <template v-if="tab === 'orders'"><div class="section-heading"><h2>Orders</h2><div class="inline-form"><select v-model="orderFilter" aria-label="Filter by payment"><option value="all">All payment status</option><option value="pending">Pending payment</option><option value="paid">Paid</option><option value="payment_review">Payment review</option><option value="refunded">Refunded</option><option value="after-sales">After-sales requests</option></select><select v-model="orderFulfillment" aria-label="Filter by fulfillment"><option value="all">All fulfillment</option><option value="unfulfilled">Unfulfilled</option><option value="shipped">Shipped</option><option value="returned">Returned</option></select><select v-model="orderSort" aria-label="Sort orders"><option value="dateDesc">Newest first</option><option value="dateAsc">Oldest first</option><option value="totalDesc">Largest total</option><option value="totalAsc">Smallest total</option></select></div></div><p v-if="!filtered.length" class="empty-state">No matching orders.</p>
      <details v-for="o in filtered" :key="o.id" class="admin-order"><summary><span>{{ o.number }}</span><span>{{ o.paymentStatus }} / {{ o.fulfillmentStatus }}</span><span class="fine-print">{{ new Date(o.createdAt).toLocaleString() }}</span><strong>{{ money(o.total) }}</strong></summary><div class="info-grid"><div><h3>Customer & address</h3><p>{{ o.email }}<br>{{ o.address.name }}<br>{{ o.address.line1 }} {{ o.address.line2 }}<br>{{ o.address.city }}, {{ o.address.state }} {{ o.address.zip }}</p></div><div><h3>Items</h3><p v-for="item in o.items" :key="item.id">{{ item.sku }} · {{ item.name }} · {{ item.label }} × {{ item.quantity }}</p><p>Shipping {{ money(o.shipping) }} · Discount {{ money(o.discount) }} · Tax not calculated</p><p v-if="o.trackingNumber">{{ o.carrier }}: {{ o.trackingNumber }}</p></div></div>
        <form v-if="o.paymentStatus === 'paid' && o.fulfillmentStatus === 'unfulfilled'" class="inline-form" @submit.prevent="run(() => api.post(`/store/admin/orders/${o.id}/ship`, shipment[o.id]), 'Dispatch recorded.')"><label class="field">Carrier<select v-model="shipment[o.id].carrier"><option>USPS</option><option>UPS</option><option>FedEx</option><option>Other</option></select></label><label class="field">Tracking number<input v-model="shipment[o.id].trackingNumber" required minlength="5" maxlength="80"></label><button class="button primary" :disabled="busy">Confirm dispatch</button></form>
        <div v-if="o.returns.length" class="notice"><h3>After-sales: {{ o.returns[0].status }}</h3><p>{{ o.returns[0].reason }}</p><p>{{ o.returns[0].note }}</p><form v-if="['requested', 'approved'].includes(o.returns[0].status)" class="inline-form" @submit.prevent="run(() => api.put(`/store/admin/orders/${o.id}/return`, returns[o.id]), 'After-sales updated.')"><label class="field">Decision<select v-model="returns[o.id].status"><option v-if="o.returns[0].status === 'requested'" value="approved">Approve</option><option v-if="o.returns[0].status === 'requested'" value="rejected">Reject</option><option v-if="o.returns[0].status === 'approved'" value="received">Goods received</option></select></label><label class="field">Customer-visible note<input v-model="returns[o.id].note" required minlength="2" maxlength="2000"></label><button class="button secondary" :disabled="busy">Save decision</button></form></div>
        <details v-if="['paid', 'payment_review'].includes(o.paymentStatus)"><summary>Record a full refund</summary><p>First issue the full refund in the payment provider dashboard. Live mode verifies its amount, status and payment reference. This form does not initiate a charge or refund.</p><form @submit.prevent="run(() => api.post(`/store/admin/orders/${o.id}/refund`, refunds[o.id]), 'Full refund verified and recorded.')"><label class="field">Provider refund reference<input v-model="refunds[o.id].reference" required minlength="5" maxlength="150"></label><label class="checkbox-field"><input v-model="refunds[o.id].restock" type="checkbox">Return eligible goods to available stock (only after inspection)</label><button class="button secondary" :disabled="busy">Verify & record full refund</button></form></details>
      </details>
    </template>
    <template v-if="tab === 'coupons'"><h2>Discount codes</h2><form class="admin-editor" @submit.prevent="saveCoupon"><div class="form-grid"><label class="field">Code<input v-model="coupon.code" required pattern="[A-Za-z0-9_-]{3,40}"></label><label class="field">Percent off<input v-model.number="coupon.percent" required type="number" min="1" max="80"></label><label class="field">Minimum spend (cents)<input v-model.number="coupon.minimum" required type="number" min="0" max="1000000"></label><label class="field">Expires (optional)<input v-model="coupon.expiresAt" type="datetime-local"></label></div><label class="checkbox-field"><input v-model="coupon.active" type="checkbox">Active</label><button class="button primary" :disabled="busy">Save code</button></form><div class="table-wrap"><table><thead><tr><th>Code</th><th>Discount</th><th>Minimum</th><th>Status</th><th></th></tr></thead><tbody><tr v-for="c in coupons" :key="c.code"><td>{{ c.code }}</td><td>{{ c.percent }}%</td><td>{{ money(c.minimum) }}</td><td>{{ c.active ? 'Active' : 'Disabled' }}</td><td><button class="text-link" @click="Object.assign(coupon, { ...c, expiresAt: c.expiresAt ? new Date(new Date(c.expiresAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '' })">Edit</button></td></tr></tbody></table></div></template>
  </section>
</template>
<style scoped>
.image-preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-top: 10px; }
.image-preview-grid figure { margin: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.image-preview-grid img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; background: var(--muted); }
.image-preview-grid figcaption { padding: 8px 10px; font-size: 11px; display: flex; flex-direction: column; gap: 6px; word-break: break-all; }
.image-preview-grid figure.broken { border-color: var(--warn); }
.pill { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; display: inline-block; width: fit-content; }
.pill.ok { background: var(--success-soft); color: var(--success); }
.pill.warn { background: var(--warn-soft); color: var(--warn); }
textarea.invalid { border-color: var(--warn); }
.variant-editor { display: grid; grid-template-columns: 1.4fr 1.4fr 1fr 1fr auto auto; gap: 10px; align-items: end; padding: 12px; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 10px; }
.variant-editor.row-conflict { border-color: var(--warn); background: var(--warn-soft); }
.row-hint { grid-column: 1 / -1; color: var(--warn); font-weight: 600; padding-top: 4px; }
.inline-form { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
@media (max-width: 900px) {
  .variant-editor { grid-template-columns: 1fr 1fr; }
  .row-hint { grid-column: 1 / -1; }
}
</style>
