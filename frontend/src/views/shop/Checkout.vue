<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight, LockKeyhole } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import api from '@/lib/axios';
import { useShopStore, money, errorMessage } from '@/stores/shop';
import { useUserStore } from '@/stores/user';
const { t } = useI18n();
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
  <section class="section-wrap"><p class="breadcrumbs"><RouterLink to="/cart">{{ t('cart.breadcrumb') }}</RouterLink> / {{ t('checkout.breadcrumb') }}</p><div class="page-intro"><p class="eyebrow">{{ t('checkout.eyebrow') }}</p><h1>{{ t('checkout.title') }}</h1><p>{{ t('checkout.guestWelcome') }} {{ shop.settings?.demo ? t('checkout.testOrderNote') : '' }}</p></div>
    <div v-if="!shop.cart.length" class="empty-state"><p>{{ t('checkout.emptyBag') }}</p><RouterLink class="button primary" to="/shop">{{ t('checkout.browse') }}</RouterLink></div>
    <form v-else class="checkout-grid" @submit.prevent="submit"><div class="checkout-form"><h2>01 &nbsp; {{ t('checkout.contact') }}</h2><p v-if="!user.isLoggedIn" class="fine-print">{{ t('checkout.haveAccount') }} <RouterLink class="text-link" to="/login?redirect=/checkout">{{ t('nav.signIn') }}</RouterLink></p><label class="field">{{ t('checkout.email') }}<input v-model="form.email" type="email" required autocomplete="email" maxlength="254"><small>{{ t('checkout.emailHint') }}</small></label><h2>02 &nbsp; {{ t('checkout.shippingAddress') }}</h2><label class="field">{{ t('checkout.fullName') }}<input v-model="form.address.name" required minlength="2" maxlength="100" autocomplete="shipping name"></label><label class="field">{{ t('checkout.streetAddress') }}<input v-model="form.address.line1" required minlength="3" maxlength="150" autocomplete="shipping address-line1"></label><label class="field">{{ t('checkout.apartment') }}<input v-model="form.address.line2" maxlength="150" autocomplete="shipping address-line2"></label><div class="form-grid"><label class="field">{{ t('checkout.city') }}<input v-model="form.address.city" required minlength="2" maxlength="80" autocomplete="shipping address-level2"></label><label class="field">{{ t('checkout.state') }}<select v-model="form.address.state" required autocomplete="shipping address-level1"><option value="" disabled>{{ t('checkout.selectState') }}</option><option v-for="state in states" :key="state">{{ state }}</option></select></label><label class="field">{{ t('checkout.zip') }}<input v-model="form.address.zip" required pattern="\d{5}(-\d{4})?" maxlength="10" autocomplete="shipping postal-code"></label><label class="field">{{ t('checkout.country') }}<input :value="t('checkout.unitedStates')" disabled></label></div><p class="fine-print">{{ t('checkout.contiguous') }}</p><h2>03 &nbsp; {{ t('checkout.confirm') }}</h2><label class="checkbox-field"><input v-model="form.adult" required type="checkbox">{{ t('checkout.confirmAdult') }}</label><label class="checkbox-field"><input v-model="form.terms" required type="checkbox"><span>{{ t('checkout.agreeTerms') }} <RouterLink to="/help/terms" target="_blank">{{ t('checkout.terms') }}</RouterLink> {{ t('checkout.and') }} <RouterLink to="/help/privacy" target="_blank">{{ t('checkout.privacyPolicy') }}</RouterLink>.</span></label><p class="fine-print"><LockKeyhole :size="14" /> {{ t('checkout.noPaymentCollected') }}</p></div>
      <aside class="order-summary"><h2>{{ t('checkout.yourOrder') }}</h2><div v-for="item in quote?.lines || []" :key="item.variantId" class="summary-item"><div><strong>{{ item.name }}</strong><small>{{ item.label }} · {{ t('checkout.qty') }} {{ item.quantity }}</small></div><span>{{ money(item.unitPrice * item.quantity) }}</span></div><template v-if="quote"><div class="summary-line"><span>{{ t('cart.subtotal') }}</span><span>{{ money(quote.subtotal) }}</span></div><div v-if="quote.discount" class="summary-line"><span>{{ t('cart.discount') }}</span><span>-{{ money(quote.discount) }}</span></div><div class="summary-line"><span>{{ t('cart.shipping') }}</span><span>{{ quote.shipping ? money(quote.shipping) : t('common.free') }}</span></div><div class="summary-line"><span>{{ t('cart.salesTax') }}</span><span>{{ t('common.notCalculated') }}</span></div><div class="summary-total"><span>{{ t('cart.total') }}</span><span>{{ money(quote.total) }}</span></div></template><p v-if="error" class="notice error" role="alert">{{ error }}</p><button class="button primary full" :disabled="busy || !quote || !shop.settings?.checkoutEnabled">{{ busy ? t('checkout.creating') : shop.settings?.demo ? t('checkout.createTestOrder') : t('checkout.continuePayment') }}<ArrowRight :size="18" /></button><p class="fine-print">{{ t('checkout.reserveNote') }}</p></aside>
    </form>
  </section>
</template>
