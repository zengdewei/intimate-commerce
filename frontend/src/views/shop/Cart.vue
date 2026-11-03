<script setup lang="ts">
import { ref, watch } from 'vue';
import { ArrowRight, Minus, Plus, X } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import api from '@/lib/axios';
import { useShopStore, money, errorMessage } from '@/stores/shop';
const { t } = useI18n();
const shop = useShopStore();
const coupon = ref(sessionStorage.getItem('intimate_coupon') || '');
const quote = ref<any>(null);
const error = ref('');
const busy = ref(false);
let generation = 0;
async function refresh() {
  const current = ++generation;
  quote.value = null; error.value = '';
  if (!shop.cart.length) return;
  busy.value = true;
  try {
    const { data } = await api.post('/store/quote', { items: shop.cart.map(({ variantId, quantity }) => ({ variantId, quantity })), coupon: coupon.value });
    if (current === generation) { quote.value = data; sessionStorage.setItem('intimate_coupon', coupon.value); }
  } catch (e) { if (current === generation) error.value = errorMessage(e); }
  finally { if (current === generation) busy.value = false; }
}
watch(() => JSON.stringify(shop.cart), refresh, { immediate: true });
</script>
<template>
  <section class="section-wrap"><p class="breadcrumbs"><RouterLink to="/shop">{{ t('nav.collection') }}</RouterLink> / {{ t('cart.breadcrumb') }}</p><div class="page-intro"><p class="eyebrow">{{ t('cart.eyebrow') }}</p><h1>{{ t('cart.title') }} <span class="muted">({{ shop.count }})</span></h1></div>
    <div v-if="!shop.cart.length" class="empty-state"><h2>{{ t('cart.emptyTitle') }}</h2><p>{{ t('cart.emptyBody') }}</p><RouterLink class="button primary" to="/shop">{{ t('common.explore') }} <ArrowRight :size="18" /></RouterLink></div>
    <div v-else class="checkout-grid"><div><div v-for="item in shop.cart" :key="item.variantId" class="cart-row"><div><RouterLink :to="`/products/${item.slug}`"><h3>{{ item.name }}</h3></RouterLink><p>{{ item.label }}</p><small>{{ money(quote?.lines.find((l: any) => l.variantId === item.variantId)?.unitPrice ?? item.price) }} {{ t('cart.each') }}</small></div><div class="quantity-control"><button :aria-label="t('cart.decrease', { name: item.name })" @click="shop.update(item.variantId, item.quantity - 1)"><Minus :size="14" /></button><span>{{ item.quantity }}</span><button :disabled="item.quantity >= 10" :aria-label="t('cart.increase', { name: item.name })" @click="shop.update(item.variantId, item.quantity + 1)"><Plus :size="14" /></button></div><strong>{{ money((quote?.lines.find((l: any) => l.variantId === item.variantId)?.unitPrice ?? item.price) * item.quantity) }}</strong><button class="icon-button" :aria-label="t('cart.remove', { name: item.name })" @click="shop.update(item.variantId, 0)"><X :size="18" /></button></div><RouterLink class="text-link" to="/shop">{{ t('cart.continueExploring') }} <ArrowRight :size="16" /></RouterLink></div>
      <aside class="order-summary"><p class="eyebrow">{{ t('cart.detailsEyebrow') }}</p><h2>{{ t('cart.orderSummary') }}</h2><form class="coupon-form" @submit.prevent="refresh"><input v-model="coupon" aria-label="Discount code" :placeholder="t('cart.discountCode')" maxlength="40"><button :disabled="busy" class="button secondary">{{ t('cart.apply') }}</button></form><div v-if="error" class="notice error" role="alert">{{ error }}</div><p v-if="busy">{{ t('cart.updatingTotals') }}</p><template v-if="quote"><div class="summary-line"><span>{{ t('cart.subtotal') }}</span><span>{{ money(quote.subtotal) }}</span></div><div v-if="quote.discount" class="summary-line"><span>{{ t('cart.discount') }}</span><span>-{{ money(quote.discount) }}</span></div><div class="summary-line"><span>{{ t('cart.shipping') }}</span><span>{{ quote.shipping ? money(quote.shipping) : t('common.free') }}</span></div><div class="summary-line"><span>{{ t('cart.salesTax') }}</span><span>{{ t('common.notCalculated') }}</span></div><div class="summary-total"><span>{{ t('cart.total') }}</span><span>{{ money(quote.total) }}</span></div><RouterLink v-if="shop.settings?.checkoutEnabled" class="button primary full" to="/checkout">{{ t('cart.continueCheckout') }} <ArrowRight :size="18" /></RouterLink><p v-else class="notice">{{ t('cart.checkoutClosed') }}</p></template><p class="fine-print">{{ t('cart.finePrint') }} {{ shop.settings?.demo ? t('cart.previewNote') : '' }}</p></aside>
    </div>
  </section>
</template>
