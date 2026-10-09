<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/lib/axios';
import { useShopStore, money, errorMessage } from '@/stores/shop';
const route = useRoute();
const shop = useShopStore();
const id = String(route.params.id);
const fragment = new URLSearchParams(location.hash.slice(1));
if (fragment.get('access')) {
  sessionStorage.setItem(`order_access_${id}`, fragment.get('access')!);
  history.replaceState(null, '', location.pathname + location.search);
}
const headers = () => ({ 'x-order-token': sessionStorage.getItem(`order_access_${id}`) || '' });
const order = ref<any>(null);
const error = ref('');
const busy = ref(false);
const reason = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
let attempts = 0;
async function load() {
  error.value = '';
  try { order.value = (await api.get(`/store/orders/${id}`, { headers: headers() })).data; }
  catch (e) { error.value = errorMessage(e); }
  if (route.query.payment && order.value?.paymentStatus === 'pending' && attempts++ < 12) timer = setTimeout(load, 3000);
}
async function action(name: string, body = {}) {
  busy.value = true; error.value = '';
  try {
    const { data } = await api.post(`/store/orders/${id}/${name}`, body, { headers: headers() });
    if (data.url) { location.assign(data.url); return; }
    await load();
  } catch (e) { error.value = errorMessage(e); }
  finally { busy.value = false; }
}
onMounted(load);
onUnmounted(() => clearTimeout(timer));
</script>
<template>
  <section class="section-wrap order-page"><p class="breadcrumbs"><RouterLink to="/shop">Collection</RouterLink> / Your order</p><p v-if="error" class="notice error" role="alert">{{ error }} <RouterLink to="/track">Request a new access link</RouterLink></p>
    <template v-if="order"><div class="page-intro"><p class="eyebrow">{{ order.number }}</p><h1>{{ order.paymentStatus === 'paid' ? 'A little good is on its way.' : order.paymentStatus === 'pending' ? 'Your order is reserved.' : 'Your order details.' }}</h1><p>Payment: <strong>{{ order.paymentStatus.replaceAll('_', ' ') }}</strong> <span class="muted"> / </span> Dispatch: <strong>{{ order.fulfillmentStatus }}</strong></p></div>
      <div v-if="order.paymentStatus === 'payment_review'" class="notice">Payment arrived after the reservation ended. Do not pay again. Support must review this order and arrange a refund.</div>
      <div class="checkout-grid"><div><div class="order-status-card"><h2>What happens next?</h2><p v-if="order.paymentStatus === 'pending'">Your items are reserved until {{ new Date(order.expiresAt).toLocaleString() }}. Complete payment before the reservation expires.</p><p v-else-if="order.paymentStatus === 'paid'">Your payment is confirmed. Dispatch and tracking details appear here when your parcel is ready.</p><p v-else-if="order.paymentStatus === 'refunded'">A full refund has been confirmed. Timing depends on the payment provider.</p><p v-else>This order is no longer payable.</p><div v-if="order.paymentStatus === 'pending'" class="button-row"><button class="button primary" :disabled="busy" @click="action(shop.settings?.demo ? 'mock-pay' : 'payment')">{{ busy ? 'Please wait...' : shop.settings?.demo ? 'Simulate successful payment' : 'Pay securely' }}</button><button class="button secondary" :disabled="busy" @click="action('cancel')">Cancel order</button></div><p v-if="shop.settings?.demo" class="fine-print">Test mode only. No card charge or physical dispatch occurs.</p></div>
        <div class="info-grid"><div><h3>Shipping to</h3><p>{{ order.address.name }}<br>{{ order.address.line1 }} {{ order.address.line2 }}<br>{{ order.address.city }}, {{ order.address.state }} {{ order.address.zip }}<br>United States</p></div><div><h3>Contact</h3><p>{{ order.email }}</p><h3 v-if="order.trackingNumber">Tracking</h3><p v-if="order.trackingNumber">{{ order.carrier }}<br>{{ order.trackingNumber }}</p></div></div>
        <div v-if="order.returns.length" class="notice"><h3>After-sales request: {{ order.returns[0].status }}</h3><p>{{ order.returns[0].reason }}</p><p v-if="order.returns[0].note">{{ order.returns[0].note }}</p></div><form v-else-if="order.paymentStatus === 'paid'" class="support-form" @submit.prevent="action('returns', { reason })"><h3>Need help with this order?</h3><p>Submit a cancellation, return or product issue for review. Approval is subject to the returns policy.</p><label class="field">Tell us what happened<textarea v-model="reason" required minlength="10" maxlength="2000" rows="4"></textarea></label><button :disabled="busy" class="button secondary">Submit request</button></form>
      </div><aside class="order-summary"><h2>Order summary</h2><div v-for="item in order.items" :key="item.id" class="summary-item"><div><strong>{{ item.name }}</strong><small>{{ item.label }} · Qty {{ item.quantity }}</small></div><span>{{ money(item.unitPrice * item.quantity) }}</span></div><div class="summary-line"><span>Subtotal</span><span>{{ money(order.subtotal) }}</span></div><div v-if="order.discount" class="summary-line"><span>Discount</span><span>-{{ money(order.discount) }}</span></div><div class="summary-line"><span>Shipping</span><span>{{ money(order.shipping) }}</span></div><div class="summary-line"><span>Sales tax</span><span>Not calculated</span></div><div class="summary-total"><span>Total</span><span>{{ money(order.total) }}</span></div><RouterLink class="text-link" to="/shop">Continue exploring</RouterLink></aside></div>
    </template><p v-else-if="!error" class="empty-state">Loading your order...</p>
  </section>
</template>
