<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useShopStore, categoryName } from '@/stores/shop';
import ProductCard from '@/components/shop/ProductCard.vue';
const { t } = useI18n();
const shop = useShopStore();
const route = useRoute();
const sort = ref('featured');
const categories = computed(() => [...new Set(shop.products.map(p => p.category))]);
const products = computed(() => {
  const list = shop.products.filter(p => !route.query.category || p.category === route.query.category);
  if (sort.value !== 'featured') list.sort((a, b) => (Math.min(...a.variants.map(v => v.price)) - Math.min(...b.variants.map(v => v.price))) * (sort.value === 'low' ? 1 : -1));
  return list;
});
</script>
<template>
  <div class="section-wrap catalog-page"><p class="breadcrumbs"><RouterLink to="/">{{ t('nav.home') }}</RouterLink> / {{ t('catalog.breadcrumb') }}</p><div class="page-intro"><p class="eyebrow">{{ t('catalog.eyebrow') }}</p><h1>{{ route.query.category ? categoryName(String(route.query.category)) : t('catalog.defaultTitle') }}</h1><p>{{ t('catalog.subtitle') }}</p></div>
    <div class="catalog-toolbar"><div class="filter-tabs"><RouterLink to="/shop" :class="{ selected: !route.query.category }">{{ t('catalog.allEssentials') }}</RouterLink><RouterLink v-for="c in categories" :key="c" :to="`/shop?category=${c}`" :class="{ selected: route.query.category === c }">{{ categoryName(c) }}</RouterLink></div><label class="sort-label">{{ products.length }} {{ t('catalog.sortLabel') }} <select v-model="sort" aria-label="Sort products"><option value="featured">{{ t('catalog.sortFeatured') }}</option><option value="low">{{ t('catalog.sortLow') }}</option><option value="high">{{ t('catalog.sortHigh') }}</option></select></label></div>
    <div v-if="shop.error" class="notice error">{{ shop.error }} <button @click="shop.load(true)">{{ t('catalog.retry') }}</button></div><p v-else-if="shop.loading" class="empty-state">{{ t('catalog.loading') }}</p><div v-else-if="products.length" class="product-grid"><ProductCard v-for="(p, i) in products" :key="p.id" :product="p" :index="i" /></div><div v-else class="empty-state"><h2>{{ t('catalog.comingSoon') }}</h2><RouterLink class="text-link" to="/shop">{{ t('catalog.browseAll') }}</RouterLink></div>
  </div>
</template>
