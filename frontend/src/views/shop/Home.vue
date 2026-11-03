<script setup lang="ts">
import { ArrowRight, ArrowUpRight, Heart, Package, Sparkles } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useShopStore, editorialImage } from '@/stores/shop';
import ProductCard from '@/components/shop/ProductCard.vue';
const { t } = useI18n();
const shop = useShopStore();
</script>
<template>
  <section class="hero">
    <div class="hero-copy"><p class="eyebrow"><span class="small-line"></span> {{ t('home.heroEyebrow') }}</p><h1>{{ t('home.heroTitle') }}</h1><p class="hero-description">{{ t('home.heroDesc') }}</p><RouterLink class="button primary" to="/shop">{{ t('home.heroCta') }} <ArrowUpRight :size="19" /></RouterLink><span class="hero-footnote">{{ t('home.heroFootnote') }}</span></div>
    <div class="hero-art"><img :src="editorialImage" alt="Burgundy calla lily, rose quartz and soft linen in a warm editorial still life" fetchpriority="high"><div class="hero-art-label"><span>{{ t('home.heroArtLabel1') }}</span><span>{{ t('home.heroArtLabel2') }}</span></div></div>
  </section>
  <div class="values-bar"><div><Heart :size="20" /><span>{{ t('home.value1') }}</span></div><div><Package :size="20" /><span>{{ t('home.value2') }}</span></div><div><Sparkles :size="20" /><span>{{ t('home.value3') }}</span></div></div>
  <section class="section-wrap">
    <div class="section-heading"><div><p class="eyebrow">{{ t('home.sectionEyebrow') }}</p><h2>{{ t('home.sectionTitle') }}</h2></div><RouterLink class="text-link" to="/shop">{{ t('home.sectionCta') }} <ArrowRight :size="18" /></RouterLink></div>
    <p v-if="shop.error" class="notice error" role="alert">{{ shop.error }} <button @click="shop.load(true)">{{ t('common.retry') }}</button></p>
    <p v-else-if="shop.loading" class="empty-state">{{ t('home.loadingCollection') }}</p>
    <div v-else-if="shop.products.length" class="product-grid"><ProductCard v-for="(p, i) in shop.products.slice(0, 4)" :key="p.id" :product="p" :index="i" /></div>
    <div v-else class="empty-state"><h3>{{ t('home.emptyTitle') }}</h3><p>{{ t('home.emptyBody') }}</p></div>
  </section>
  <section class="category-section"><div class="section-heading"><div><p class="eyebrow">{{ t('home.catEyebrow') }}</p><h2>{{ t('home.catTitle') }}</h2></div><p>{{ t('home.catSubtitle') }}</p></div><div class="category-grid"><RouterLink to="/shop?category=non-powered"><span class="eyebrow">{{ t('home.catNonPoweredTag') }}</span><h3>{{ t('home.catNonPoweredTitle') }}</h3><span class="text-link">{{ t('home.catNonPoweredCta') }} <ArrowUpRight :size="20" /></span><span class="category-number">01</span></RouterLink><RouterLink to="/shop?category=powered"><span class="eyebrow">{{ t('home.catPoweredTag') }}</span><h3>{{ t('home.catPoweredTitle') }}</h3><span class="text-link">{{ t('home.catPoweredCta') }} <ArrowUpRight :size="20" /></span><span class="category-number">02</span></RouterLink></div></section>
  <section class="editorial-section"><div class="editorial-quote"><span class="eyebrow">{{ t('home.noteEyebrow') }}</span><h2>{{ t('home.noteTitle') }}</h2></div><div class="editorial-body"><p>{{ t('home.noteBody1') }}</p><p>{{ t('home.noteBody2') }}</p><RouterLink class="text-link" to="/guide">{{ t('home.noteCta') }} <ArrowUpRight :size="18" /></RouterLink></div></section>
</template>
