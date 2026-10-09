<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useShopStore, categoryName } from '@/stores/shop';
import ProductCard from '@/components/shop/ProductCard.vue';
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
  <div class="section-wrap catalog-page"><p class="breadcrumbs"><RouterLink to="/">Home</RouterLink> / The collection</p><div class="page-intro"><p class="eyebrow">YOUR NEXT GOOD THING</p><h1>{{ route.query.category ? categoryName(String(route.query.category)) : 'The personal collection.' }}</h1><p>Considered essentials. Your own way to explore.</p></div>
    <div class="catalog-toolbar"><div class="filter-tabs"><RouterLink to="/shop" :class="{ selected: !route.query.category }">All essentials</RouterLink><RouterLink v-for="c in categories" :key="c" :to="`/shop?category=${c}`" :class="{ selected: route.query.category === c }">{{ categoryName(c) }}</RouterLink></div><label class="sort-label">{{ products.length }} products <select v-model="sort" aria-label="Sort products"><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></label></div>
    <div v-if="shop.error" class="notice error">{{ shop.error }} <button @click="shop.load(true)">Retry</button></div><p v-else-if="shop.loading" class="empty-state">Loading products...</p><div v-else-if="products.length" class="product-grid"><ProductCard v-for="(p, i) in products" :key="p.id" :product="p" :index="i" /></div><div v-else class="empty-state"><h2>This edit is coming soon.</h2><RouterLink class="text-link" to="/shop">Browse all available essentials</RouterLink></div>
  </div>
</template>
