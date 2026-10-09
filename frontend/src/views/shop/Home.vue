<script setup lang="ts">
import { ArrowRight, ArrowUpRight, Heart, Package, Sparkles } from 'lucide-vue-next';
import { useShopStore, editorialImage } from '@/stores/shop';
import ProductCard from '@/components/shop/ProductCard.vue';
const shop = useShopStore();
</script>
<template>
  <section class="hero">
    <div class="hero-copy"><p class="eyebrow"><span class="small-line"></span> MADE FOR YOUR MOMENTS</p><h1>Your pleasure.<br>Your pace.<br><em>Your way.</em></h1><p class="hero-description">Make room for what feels good. Explore intimate essentials, thoughtful guidance, and a little time that's entirely yours.</p><RouterLink class="button primary" to="/shop">Explore the collection <ArrowUpRight :size="19" /></RouterLink><span class="hero-footnote">A thoughtful space for adult women.</span></div>
    <div class="hero-art"><img :src="editorialImage" alt="Burgundy calla lily, rose quartz and soft linen in a warm editorial still life" fetchpriority="high"><div class="hero-art-label"><span>THE ART OF<br>FEELING GOOD</span><span>01 / THE PERSONAL EDIT</span></div></div>
  </section>
  <div class="values-bar"><div><Heart :size="20" /><span>Pleasure without pressure</span></div><div><Package :size="20" /><span>Shipping from the US</span></div><div><Sparkles :size="20" /><span>A more personal kind of shopping</span></div></div>
  <section class="section-wrap">
    <div class="section-heading"><div><p class="eyebrow">A LITTLE CURIOSITY GOES A LONG WAY</p><h2>Meet your personal edit.</h2></div><RouterLink class="text-link" to="/shop">Explore all <ArrowRight :size="18" /></RouterLink></div>
    <p v-if="shop.error" class="notice error" role="alert">{{ shop.error }} <button @click="shop.load(true)">Try again</button></p>
    <p v-else-if="shop.loading" class="empty-state">Loading the collection...</p>
    <div v-else-if="shop.products.length" class="product-grid"><ProductCard v-for="(p, i) in shop.products.slice(0, 4)" :key="p.id" :product="p" :index="i" /></div>
    <div v-else class="empty-state"><h3>Our collection is being prepared.</h3><p>Come back soon for the first edit.</p></div>
  </section>
  <section class="category-section"><div class="section-heading"><div><p class="eyebrow">FOLLOW YOUR CURIOSITY</p><h2>Find your kind of good.</h2></div><p>No right starting point.<br>Just the one that feels like you.</p></div><div class="category-grid"><RouterLink to="/shop?category=non-powered"><span class="eyebrow">SIMPLE. PERSONAL. YOURS.</span><h3>Non-powered<br><em>essentials.</em></h3><span class="text-link">Explore the edit <ArrowUpRight :size="20" /></span><span class="category-number">01</span></RouterLink><RouterLink to="/shop?category=powered"><span class="eyebrow">A DIFFERENT KIND OF ENERGY</span><h3>Powered<br><em>pleasure.</em></h3><span class="text-link">Find your rhythm <ArrowUpRight :size="20" /></span><span class="category-number">02</span></RouterLink></div></section>
  <section class="editorial-section"><div class="editorial-quote"><span class="eyebrow">A NOTE FROM US</span><h2>Not a luxury.<br>Not a guilty pleasure.<br><em>Just a part of you.</em></h2></div><div class="editorial-body"><p>We believe exploring your pleasure should feel comfortable, considered, and completely on your terms.</p><p>That means clear product information, space to ask questions, and no pressure to be anyone but yourself.</p><RouterLink class="text-link" to="/guide">A gentle place to begin <ArrowUpRight :size="18" /></RouterLink></div></section>
</template>
