<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowRight, Check, Package } from 'lucide-vue-next';
import api from '@/lib/axios';
import { useShopStore, categoryName, errorMessage, money, type Product } from '@/stores/shop';
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
  <section class="section-wrap"><p class="breadcrumbs"><RouterLink to="/">Home</RouterLink> / <RouterLink to="/shop">Collection</RouterLink> / {{ product?.name || 'Product' }}</p><div v-if="error" class="notice error" role="alert">{{ error }}</div>
    <div v-if="product" class="product-detail">
      <div><div v-if="product.images.length" class="detail-photo"><img :src="product.images[image]" :alt="product.name"></div><div v-else class="detail-editorial"><span class="eyebrow">PREVIEW LISTING</span><h2>{{ product.name }}</h2><p>Actual product photography<br>has not yet been supplied.</p><span>NOT AVAILABLE FOR REAL PURCHASE</span></div><div class="image-thumbnails"><button v-for="(src, i) in product.images" :key="src" :aria-label="`View image ${i + 1}`" @click="image = i"><img :src="src" :alt="`${product.name} view ${i + 1}`"></button></div></div>
      <div class="product-buy"><p class="eyebrow">{{ categoryName(product.category) }}</p><h1>{{ product.name }}</h1><p class="detail-price">{{ variant ? money(variant.price) : 'Unavailable' }} <small>USD{{ product.demo ? ' · Sample price' : '' }}</small></p><p>{{ product.description }}</p>
        <label class="field">Choose your option<select v-model="variantId"><option v-for="v in product.variants" :key="v.id" :value="v.id">{{ v.label }}{{ !v.stock ? ' · Sold out' : '' }}</option></select></label><p class="stock-note">{{ variant?.stock ? `${variant.stock} ${product.demo ? 'demo units' : 'units'} available` : 'Currently unavailable' }}</p>
        <div class="buy-actions"><label class="quantity-input"><span class="sr-only">Quantity</span><input v-model.number="quantity" type="number" min="1" :max="Math.min(variant?.stock || 1, 10)"></label><button class="button primary" :disabled="!variant?.stock || quantity < 1 || !Number.isInteger(quantity)" @click="add">Add to bag <ArrowRight :size="18" /></button></div>
        <p v-if="added" class="notice success" role="status"><Check :size="17" /> Added to your bag. <RouterLink to="/cart">View bag & checkout</RouterLink></p>
        <p class="shipping-note"><Package :size="18" /> {{ shop.settings?.shippingNotice }}</p>
        <details open><summary>Materials & dimensions</summary><p><strong>Material:</strong> {{ product.material || 'Awaiting verified product information.' }}</p><p><strong>Dimensions:</strong> {{ product.dimensions || 'Awaiting verified measurements.' }}</p></details>
        <details><summary>Care & use</summary><p>{{ product.care || 'Product-specific instructions will be supplied before sale. Do not rely on demonstration listings for usage guidance.' }}</p></details>
        <details><summary>Shipping & returns</summary><p>{{ shop.settings?.returnsNotice }}</p><RouterLink class="text-link" to="/help/shipping">Read shipping information</RouterLink></details>
      </div>
    </div><p v-else-if="!error" class="empty-state">Loading product...</p>
  </section>
</template>
