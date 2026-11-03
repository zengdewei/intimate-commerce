<script setup lang="ts">
import { ArrowUpRight } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { categoryName, money, type Product } from '@/stores/shop';
const { t } = useI18n();
defineProps<{ product: Product; index?: number }>();
</script>
<template>
  <article class="product-card">
    <RouterLink :to="`/products/${product.slug}`" class="product-card-link">
      <div v-if="product.images.length" class="product-photo"><img :src="product.images[0]" :alt="product.name" loading="lazy"><span v-if="product.demo" class="product-tag">DEMO</span></div>
      <div v-else class="product-editorial" :class="`tone-${(index || 0) % 4}`"><span class="product-tag">{{ t('product.demoTag') }} {{ String((index || 0) + 1).padStart(2, '0') }}</span><span class="editorial-name">{{ product.name.replace('The ', '') }}</span><span class="editorial-note">{{ t('product.photographyPending') }}</span><ArrowUpRight :size="24" /></div>
      <div class="product-meta"><span>{{ categoryName(product.category) }}</span><span v-if="product.variants.every(v => v.stock === 0)">{{ t('common.soldOut') }}</span><span v-else>{{ product.demo ? t('common.previewEdit') : t('common.viewDetails') }}</span></div>
      <div class="product-title"><h3>{{ product.name }}</h3><span>{{ product.variants.length ? money(Math.min(...product.variants.map(v => v.price))) : t('common.unavailable') }}</span></div>
      <p class="product-caption">{{ product.demo ? t('product.samplePriceCaption') : `${product.variants.length} ${product.variants.length === 1 ? t('product.optionAvailable') : t('product.optionsAvailable')}` }}</p>
    </RouterLink>
  </article>
</template>
