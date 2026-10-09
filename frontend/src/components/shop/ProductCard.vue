<script setup lang="ts">
import { ArrowUpRight } from 'lucide-vue-next';
import { categoryName, money, type Product } from '@/stores/shop';
defineProps<{ product: Product; index?: number }>();
</script>
<template>
  <article class="product-card">
    <RouterLink :to="`/products/${product.slug}`" class="product-card-link">
      <div v-if="product.images.length" class="product-photo"><img :src="product.images[0]" :alt="product.name" loading="lazy"><span v-if="product.demo" class="product-tag">DEMO</span></div>
      <div v-else class="product-editorial" :class="`tone-${(index || 0) % 4}`"><span class="product-tag">DEMONSTRATION {{ String((index || 0) + 1).padStart(2, '0') }}</span><span class="editorial-name">{{ product.name.replace('The ', '') }}</span><span class="editorial-note">Product photography is not yet supplied.<br>Explore the preview listing.</span><ArrowUpRight :size="24" /></div>
      <div class="product-meta"><span>{{ categoryName(product.category) }}</span><span v-if="product.variants.every(v => v.stock === 0)">Sold out</span><span v-else>{{ product.demo ? 'Preview edit' : 'View details' }}</span></div>
      <div class="product-title"><h3>{{ product.name }}</h3><span>{{ product.variants.length ? money(Math.min(...product.variants.map(v => v.price))) : 'Unavailable' }}</span></div>
      <p class="product-caption">{{ product.demo ? 'Sample price · Not a real product offer' : `${product.variants.length} option${product.variants.length === 1 ? '' : 's'} available` }}</p>
    </RouterLink>
  </article>
</template>
