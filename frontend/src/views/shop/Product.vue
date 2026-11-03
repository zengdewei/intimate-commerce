<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowRight, Check, Package } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import api from '@/lib/axios';
import { useShopStore, categoryName, errorMessage, money, type Product } from '@/stores/shop';
const { t } = useI18n();
const route = useRoute();
const shop = useShopStore();
const product = ref<Product | null>(null);
const variantId = ref('');
const image = ref(0);
const quantity = ref(1);
const error = ref('');
const added = ref(false);
const variant = computed(() => product.value?.variants.find(v => v.id === variantId.value));
watch(() => route.params.slug, async () => {
  product.value = null; error.value = ''; added.value = false; image.value = 0; quantity.value = 1;
  try { product.value = (await api.get(`/store/products/${route.params.slug}`)).data; variantId.value = product.value!.variants[0]?.id || ''; }
  catch (e) { error.value = errorMessage(e); }
}, { immediate: true });
function add() {
  error.value = ''; added.value = false;
  try { if (product.value && variant.value) { shop.add(product.value, variant.value, quantity.value); added.value = true; } }
  catch (e) { error.value = errorMessage(e); }
}
</script>
<template>
  <section class="section-wrap"><p class="breadcrumbs"><RouterLink to="/">{{ t('nav.home') }}</RouterLink> / <RouterLink to="/shop">{{ t('nav.collection') }}</RouterLink> / {{ product?.name || t('product.breadcrumbProduct') }}</p><div v-if="error" class="notice error" role="alert">{{ error }}</div>
    <div v-if="product" class="product-detail">
      <div><div v-if="product.images.length" class="detail-photo"><img :src="product.images[image]" :alt="product.name"></div><div v-else class="detail-editorial"><span class="eyebrow">{{ t('product.previewListing') }}</span><h2>{{ product.name }}</h2><p>{{ t('product.previewBody') }}</p><span>{{ t('product.previewNotReal') }}</span></div><div class="image-thumbnails"><button v-for="(src, i) in product.images" :key="src" :aria-label="t('product.viewImage', { n: i + 1 })" @click="image = i"><img :src="src" :alt="`${product.name} view ${i + 1}`"></button></div></div>
      <div class="product-buy"><p class="eyebrow">{{ categoryName(product.category) }}</p><h1>{{ product.name }}</h1><p class="detail-price">{{ variant ? money(variant.price) : t('common.unavailable') }} <small>USD{{ product.demo ? ` · ${t('product.samplePrice')}` : '' }}</small></p><p>{{ product.description }}</p>
        <label class="field">{{ t('product.chooseOption') }}<select v-model="variantId"><option v-for="v in product.variants" :key="v.id" :value="v.id">{{ v.label }}{{ !v.stock ? ` · ${t('common.soldOut')}` : '' }}</option></select></label><p class="stock-note">{{ variant?.stock ? t(product.demo ? 'product.demoUnitsAvailable' : 'product.unitsAvailable', { n: variant.stock }) : t('product.currentlyUnavailable') }}</p>
        <div class="buy-actions"><label class="quantity-input"><span class="sr-only">{{ t('product.quantity') }}</span><input v-model.number="quantity" type="number" min="1" :max="Math.min(variant?.stock || 1, 10)"></label><button class="button primary" :disabled="!variant?.stock || quantity < 1 || !Number.isInteger(quantity)" @click="add">{{ t('product.addToBag') }} <ArrowRight :size="18" /></button></div>
        <p v-if="added" class="notice success" role="status"><Check :size="17" /> {{ t('product.addedToBag') }} <RouterLink to="/cart">{{ t('product.viewBagCheckout') }}</RouterLink></p>
        <p class="shipping-note"><Package :size="18" /> {{ shop.settings?.shippingNotice }}</p>
        <details open><summary>{{ t('product.materials') }}</summary><p><strong>{{ t('product.material') }}</strong> {{ product.material || t('product.awaitingMaterial') }}</p><p><strong>{{ t('product.dimensions') }}</strong> {{ product.dimensions || t('product.awaitingDimensions') }}</p></details>
        <details><summary>{{ t('product.careUse') }}</summary><p>{{ product.care || t('product.awaitingCare') }}</p></details>
        <details><summary>{{ t('product.shippingReturns') }}</summary><p>{{ shop.settings?.returnsNotice }}</p><RouterLink class="text-link" to="/help/shipping">{{ t('product.readShipping') }}</RouterLink></details>
      </div>
    </div><p v-else-if="!error" class="empty-state">{{ t('product.loadingProduct') }}</p>
  </section>
</template>
