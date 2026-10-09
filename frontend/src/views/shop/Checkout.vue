<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight, LockKeyhole } from 'lucide-vue-next';
import api from '@/lib/axios';
import { useShopStore, money, errorMessage } from '@/stores/shop';
import { useUserStore } from '@/stores/user';
const shop = useShopStore();
const user = useUserStore();
const router = useRouter();
const states = 'AL AZ AR CA CO CT DE FL GA ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const form = reactive({ email: user.me?.email || '', address: { name: user.me?.fullName || '', line1: '', line2: '', city: '', state: '', zip: '', country: 'US' }, adult: false, terms: false });
const quote = ref<any>(null);
const error = ref('');
const busy = ref(false);
let lastBody = '';
let key = crypto.randomUUID();
const input = () => ({ items: shop.cart.map(({ variantId, quantity }) => ({ variantId, quantity })), coupon: sessionStorage.getItem('intimate_coupon') || '' });
onMounted(async () => {
  if (!shop.cart.length) return;
  try { quote.value = (await api.post('/store/quote', input())).data; }
  catch (e) { error.value = errorMessage(e); }
});
async function submit() {
  busy.value = true; error.value = '';
  try {
    const body = { ...form, ...input() };
    const encoded = JSON.stringify(body);
    if (lastBody && lastBody !== encoded) key = crypto.randomUUID();
    lastBody = encoded;
    const { data } = await api.post('/store/checkout', { ...body, idempotencyKey: key });
    sessionStorage.setItem(`order_access_${data.id}`, data.accessToken);
    shop.clear(); sessionStorage.removeItem('intimate_coupon');
    await router.push(`/orders/${data.id}`);
  } catch (e) { error.value = errorMessage(e); }
  finally { busy.value = false; }
}
</script>
<template>
  <section class="section-wrap"><p class="breadcrumbs"><RouterLink to="/cart">Your bag</RouterLink> / Checkout</p><div class="page-intro"><p class="eyebrow">ALMOST YOURS</p><h1>A few final details.</h1><p>Guest checkout is welcome. {{ shop.settings?.demo ? 'This is a test order, not a real purchase.' : '' }}</p></div>
    <div v-if="!shop.cart.length" class="empty-state"><p>Your bag is empty.</p><RouterLink class="button primary" to="/shop">Browse the collection</RouterLink></div>
    <form v-else class="checkout-grid" @submit.prevent="submit"><div class="checkout-form"><h2>01 &nbsp; Contact</h2><p v-if="!user.isLoggedIn" class="fine-print">Already have an account? <RouterLink class="text-link" to="/login?redirect=/checkout">Sign in</RouterLink></p><label class="field">Email address<input v-model="form.email" type="email" required autocomplete="email" maxlength="254"><small>Your private order link will be sent here.</small></label><h2>02 &nbsp; Shipping address</h2><label class="field">Full name<input v-model="form.address.name" required minlength="2" maxlength="100" autocomplete="shipping name"></label><label class="field">Street address<input v-model="form.address.line1" required minlength="3" maxlength="150" autocomplete="shipping address-line1"></label><label class="field">Apartment, suite, etc. (optional)<input v-model="form.address.line2" maxlength="150" autocomplete="shipping address-line2"></label><div class="form-grid"><label class="field">City<input v-model="form.address.city" required minlength="2" maxlength="80" autocomplete="shipping address-level2"></label><label class="field">State<select v-model="form.address.state" required autocomplete="shipping address-level1"><option value="" disabled>Select a state</option><option v-for="state in states" :key="state">{{ state }}</option></select></label><label class="field">ZIP code<input v-model="form.address.zip" required pattern="\d{5}(-\d{4})?" maxlength="10" autocomplete="shipping postal-code"></label><label class="field">Country<input value="United States" disabled></label></div><p class="fine-print">Contiguous United States only. Alaska, Hawaii, territories and military addresses are not supported.</p><h2>03 &nbsp; Confirm & continue</h2><label class="checkbox-field"><input v-model="form.adult" required type="checkbox">I confirm I am 18 or older.</label><label class="checkbox-field"><input v-model="form.terms" required type="checkbox"><span>I agree to the <RouterLink to="/help/terms" target="_blank">Terms</RouterLink> and have read the <RouterLink to="/help/privacy" target="_blank">Privacy Policy</RouterLink> and <RouterLink to="/help/returns" target="_blank">Returns Policy</RouterLink>.</span></label><p class="fine-print"><LockKeyhole :size="14" /> Payment details are never collected in this form.</p></div>
      <aside class="order-summary"><h2>Your order</h2><div v-for="item in quote?.lines || []" :key="item.variantId" class="summary-item"><div><strong>{{ item.name }}</strong><small>{{ item.label }} · Qty {{ item.quantity }}</small></div><span>{{ money(item.unitPrice * item.quantity) }}</span></div><template v-if="quote"><div class="summary-line"><span>Subtotal</span><span>{{ money(quote.subtotal) }}</span></div><div v-if="quote.discount" class="summary-line"><span>Discount</span><span>-{{ money(quote.discount) }}</span></div><div class="summary-line"><span>Shipping</span><span>{{ quote.shipping ? money(quote.shipping) : 'Free' }}</span></div><div class="summary-line"><span>Sales tax</span><span>Not calculated</span></div><div class="summary-total"><span>Total</span><span>{{ money(quote.total) }}</span></div></template><p v-if="error" class="notice error" role="alert">{{ error }}</p><button class="button primary full" :disabled="busy || !quote || !shop.settings?.checkoutEnabled">{{ busy ? 'Creating your order...' : shop.settings?.demo ? 'Create test order' : 'Continue to payment' }}<ArrowRight :size="18" /></button><p class="fine-print">Stock is reserved for 35 minutes. Payment and dispatch are confirmed separately.</p></aside>
    </form>
  </section>
</template>
