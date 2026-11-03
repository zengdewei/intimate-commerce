<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import api from '@/lib/axios';
import { useShopStore, money, errorMessage } from '@/stores/shop';
const { t } = useI18n();
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
  <section class="section-wrap order-page"><p class="breadcrumbs"><RouterLink to="/shop">{{ t('nav.collection') }}</RouterLink> / {{ t('order.breadcrumb') }}</p><p v-if="error" class="notice error" role="alert">{{ error }} <RouterLink to="/track">{{ t('order.requestLink') }}</RouterLink></p>
    <template v-if="order"><div class="page-intro"><p class="eyebrow">{{ order.number }}</p><h1>{{ order.paymentStatus === 'paid' ? t('order.paidTitle') : order.paymentStatus === 'pending' ? t('order.pendingTitle') : t('order.defaultTitle') }}</h1><p>{{ t('order.payment') }} <strong>{{ order.paymentStatus.replaceAll('_', ' ') }}</strong> <span class="muted"> / </span> {{ t('order.dispatch') }} <strong>{{ order.fulfillmentStatus }}</strong></p></div>
      <div v-if="order.paymentStatus === 'payment_review'" class="notice">{{ t('order.reviewNotice') }}</div>
      <div class="checkout-grid"><div><div class="order-status-card"><h2>{{ t('order.whatNext') }}</h2><p v-if="order.paymentStatus === 'pending'">{{ t('order.pendingBody', { time: new Date(order.expiresAt).toLocaleString() }) }}</p><p v-else-if="order.paymentStatus === 'paid'">{{ t('order.paidBody') }}</p><p v-else-if="order.paymentStatus === 'refunded'">{{ t('order.refundedBody') }}</p><p v-else>{{ t('order.notPayable') }}</p><div v-if="order.paymentStatus === 'pending'" class="button-row"><button class="button primary" :disabled="busy" @click="action(shop.settings?.demo ? 'mock-pay' : 'payment')">{{ busy ? t('order.pleaseWait') : shop.settings?.demo ? t('order.simulatePayment') : t('order.paySecurely') }}</button><button class="button secondary" :disabled="busy" @click="action('cancel')">{{ t('order.cancelOrder') }}</button></div><p v-if="shop.settings?.demo" class="fine-print">{{ t('order.testMode') }}</p></div>
        <div class="info-grid"><div><h3>{{ t('order.shippingTo') }}</h3><p>{{ order.address.name }}<br>{{ order.address.line1 }} {{ order.address.line2 }}<br>{{ order.address.city }}, {{ order.address.state }} {{ order.address.zip }}<br>{{ t('checkout.unitedStates') }}</p></div><div><h3>{{ t('order.contact') }}</h3><p>{{ order.email }}</p><h3 v-if="order.trackingNumber">{{ t('order.tracking') }}</h3><p v-if="order.trackingNumber">{{ order.carrier }}<br>{{ order.trackingNumber }}</p></div></div>
        <div v-if="order.returns.length" class="notice"><h3>{{ t('order.aftersalesStatus') }} {{ order.returns[0].status }}</h3><p>{{ order.returns[0].reason }}</p><p v-if="order.returns[0].note">{{ order.returns[0].note }}</p></div><form v-else-if="order.paymentStatus === 'paid'" class="support-form" @submit.prevent="action('returns', { reason })"><h3>{{ t('order.needHelp') }}</h3><p>{{ t('order.needHelpBody') }}</p><label class="field">{{ t('order.tellUs') }}<textarea v-model="reason" required minlength="10" maxlength="2000" rows="4"></textarea></label><button :disabled="busy" class="button secondary">{{ t('order.submitRequest') }}</button></form>
      </div><aside class="order-summary"><h2>{{ t('order.orderSummary') }}</h2><div v-for="item in order.items" :key="item.id" class="summary-item"><div><strong>{{ item.name }}</strong><small>{{ item.label }} · {{ t('checkout.qty') }} {{ item.quantity }}</small></div><span>{{ money(item.unitPrice * item.quantity) }}</span></div><div class="summary-line"><span>{{ t('order.subtotal') }}</span><span>{{ money(order.subtotal) }}</span></div><div v-if="order.discount" class="summary-line"><span>{{ t('order.discount') }}</span><span>-{{ money(order.discount) }}</span></div><div class="summary-line"><span>{{ t('order.shipping') }}</span><span>{{ money(order.shipping) }}</span></div><div class="summary-line"><span>{{ t('order.salesTax') }}</span><span>{{ t('common.notCalculated') }}</span></div><div class="summary-total"><span>{{ t('order.total') }}</span><span>{{ money(order.total) }}</span></div><RouterLink class="text-link" to="/shop">{{ t('order.continueExploring') }}</RouterLink></aside></div>
    </template><p v-else-if="!error" class="empty-state">{{ t('order.loading') }}</p>
  </section>
</template>
