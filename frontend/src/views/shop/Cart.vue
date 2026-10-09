<script setup lang="ts">
import { ref, watch } from 'vue';
import { ArrowRight, Minus, Plus, X } from 'lucide-vue-next';
import api from '@/lib/axios';
import { useShopStore, money, errorMessage } from '@/stores/shop';
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
  <section class="section-wrap"><p class="breadcrumbs"><RouterLink to="/shop">Collection</RouterLink> / Your bag</p><div class="page-intro"><p class="eyebrow">CHOSEN BY YOU</p><h1>Your bag <span class="muted">({{ shop.count }})</span></h1></div>
    <div v-if="!shop.cart.length" class="empty-state"><h2>A little room for something good.</h2><p>Your bag is currently empty.</p><RouterLink class="button primary" to="/shop">Explore the collection <ArrowRight :size="18" /></RouterLink></div>
    <div v-else class="checkout-grid"><div><div v-for="item in shop.cart" :key="item.variantId" class="cart-row"><div><RouterLink :to="`/products/${item.slug}`"><h3>{{ item.name }}</h3></RouterLink><p>{{ item.label }}</p><small>{{ money(quote?.lines.find((l: any) => l.variantId === item.variantId)?.unitPrice ?? item.price) }} each</small></div><div class="quantity-control"><button :aria-label="`Decrease ${item.name}`" @click="shop.update(item.variantId, item.quantity - 1)"><Minus :size="14" /></button><span>{{ item.quantity }}</span><button :disabled="item.quantity >= 10" :aria-label="`Increase ${item.name}`" @click="shop.update(item.variantId, item.quantity + 1)"><Plus :size="14" /></button></div><strong>{{ money((quote?.lines.find((l: any) => l.variantId === item.variantId)?.unitPrice ?? item.price) * item.quantity) }}</strong><button class="icon-button" :aria-label="`Remove ${item.name}`" @click="shop.update(item.variantId, 0)"><X :size="18" /></button></div><RouterLink class="text-link" to="/shop">Continue exploring <ArrowRight :size="16" /></RouterLink></div>
      <aside class="order-summary"><p class="eyebrow">THE DETAILS</p><h2>Order summary</h2><form class="coupon-form" @submit.prevent="refresh"><input v-model="coupon" aria-label="Discount code" placeholder="Discount code" maxlength="40"><button :disabled="busy" class="button secondary">Apply</button></form><div v-if="error" class="notice error" role="alert">{{ error }}</div><p v-if="busy">Updating totals...</p><template v-if="quote"><div class="summary-line"><span>Subtotal</span><span>{{ money(quote.subtotal) }}</span></div><div v-if="quote.discount" class="summary-line"><span>Discount</span><span>-{{ money(quote.discount) }}</span></div><div class="summary-line"><span>Shipping</span><span>{{ quote.shipping ? money(quote.shipping) : 'Free' }}</span></div><div class="summary-line"><span>Sales tax</span><span>Not calculated</span></div><div class="summary-total"><span>Total</span><span>{{ money(quote.total) }}</span></div><RouterLink v-if="shop.settings?.checkoutEnabled" class="button primary full" to="/checkout">Continue to checkout <ArrowRight :size="18" /></RouterLink><p v-else class="notice">Checkout is not yet open.</p></template><p class="fine-print">Prices are verified again at checkout. {{ shop.settings?.demo ? 'Preview checkout does not charge your card.' : '' }}</p></aside>
    </div>
  </section>
</template>
