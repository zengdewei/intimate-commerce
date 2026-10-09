<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { ArrowUpRight, ShoppingBag, UserRound, Menu, X } from 'lucide-vue-next';
import { useShopStore } from '@/stores/shop';
import { useUserStore } from '@/stores/user';
const shop = useShopStore();
const user = useUserStore();
const route = useRoute();
const menu = ref(false);
const adult = ref(localStorage.getItem('intimate_adult') === 'yes');
function confirmAdult() {
  adult.value = true; localStorage.setItem('intimate_adult', 'yes');
  nextTick(() => document.getElementById('main-content')?.focus());
}
watch(adult, value => { document.body.style.overflow = value ? '' : 'hidden'; }, { immediate: true });
watch(() => route.fullPath, () => { menu.value = false; document.title = `${String(route.meta.title || 'Explore')} | ${shop.settings?.name || 'The Intimate Edit'}`; });
onMounted(() => shop.load());
</script>

<template>
  <div class="shop-shell">
    <div :inert="!adult || undefined">
    <a href="#main-content" class="skip-link">Skip to content</a>
    <div class="announcement"><span>A little more you. A little more pleasure.</span><span>US shipping <span class="announcement-dot">/</span> USD $</span></div>
    <header class="shop-header">
      <RouterLink class="wordmark" to="/">{{ shop.settings?.name || 'The Intimate Edit' }}<span>PLEASURE, ON YOUR TERMS.</span></RouterLink>
      <nav class="desktop-nav" aria-label="Main navigation">
        <RouterLink to="/shop">Shop all</RouterLink>
        <RouterLink to="/shop?category=non-powered">Non-powered</RouterLink>
        <RouterLink to="/shop?category=powered">Powered</RouterLink>
        <RouterLink to="/guide">The pleasure guide</RouterLink>
        <RouterLink to="/help">Our approach</RouterLink>
      </nav>
      <div class="header-actions">
        <RouterLink :to="user.isLoggedIn ? '/account' : '/login'" aria-label="Your account"><UserRound :size="20" /></RouterLink>
        <RouterLink to="/cart" aria-label="Shopping bag" class="bag-link"><ShoppingBag :size="20" /><span>{{ shop.count }}</span></RouterLink>
        <button class="mobile-menu icon-button" aria-label="Toggle navigation" :aria-expanded="menu" @click="menu = !menu"><X v-if="menu" :size="22" /><Menu v-else :size="22" /></button>
      </div>
    </header>
    <nav v-if="menu" class="mobile-nav" aria-label="Mobile navigation"><RouterLink to="/shop">Shop all</RouterLink><RouterLink to="/shop?category=non-powered">Non-powered</RouterLink><RouterLink to="/shop?category=powered">Powered</RouterLink><RouterLink to="/guide">The pleasure guide</RouterLink><RouterLink to="/help">Help & information</RouterLink></nav>
    <div v-if="shop.settings?.demo" class="preview-strip">STORE PREVIEW <span>Demonstration products and prices. No real purchases.</span></div>
    <main id="main-content" tabindex="-1"><slot /></main>
    <footer class="shop-footer">
      <div class="footer-top"><div><p class="eyebrow">YOUR SPACE TO EXPLORE</p><h2>Good things begin<br>with you.</h2><RouterLink class="text-link" to="/shop">Find your own kind of pleasure <ArrowUpRight :size="18" /></RouterLink></div>
        <div class="footer-links"><div><h3>Explore</h3><RouterLink to="/shop">Shop all</RouterLink><RouterLink to="/guide">Care & guidance</RouterLink><RouterLink to="/help">About the store</RouterLink></div><div><h3>We're here</h3><RouterLink to="/track">Track an order</RouterLink><RouterLink to="/help/shipping">Shipping</RouterLink><RouterLink to="/help/returns">Returns & support</RouterLink><RouterLink to="/help/contact">Contact</RouterLink></div><div><h3>Your account</h3><RouterLink to="/account">My orders</RouterLink><RouterLink to="/login">Sign in</RouterLink><RouterLink v-if="user.me?.isAdmin" to="/admin">Store management</RouterLink></div></div>
      </div>
      <div class="footer-bottom"><span>&copy; {{ new Date().getFullYear() }} {{ shop.settings?.name || 'The Intimate Edit' }}. Adults 18+.</span><div><RouterLink to="/help/privacy">Privacy</RouterLink><RouterLink to="/help/terms">Terms</RouterLink><span>United States · USD</span></div></div>
    </footer>
    </div>
    <div v-if="!adult" class="age-overlay"><section class="age-card" role="dialog" aria-modal="true" aria-labelledby="age-title"><p class="eyebrow">A SPACE FOR ADULTS</p><h2 id="age-title">Welcome to your<br>intimate edit.</h2><p>This store features intimate products for adults. Please confirm you are 18 or older to continue.</p><button autofocus class="button primary" @click="confirmAdult">I am 18 or older <ArrowUpRight :size="18" /></button><a class="text-link" href="https://www.google.com/">I'm under 18 · Leave</a><small>This confirmation does not replace applicable age-verification requirements.</small></section></div>
  </div>
</template>
