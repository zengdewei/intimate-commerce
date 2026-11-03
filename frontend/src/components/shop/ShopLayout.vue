<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { ArrowUpRight, ShoppingBag, UserRound, Menu, X } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { setLocale, type Locale } from '@/i18n';
import { useShopStore } from '@/stores/shop';
import { useUserStore } from '@/stores/user';
const { t, locale } = useI18n();
const shop = useShopStore();
const user = useUserStore();
const route = useRoute();
const menu = ref(false);
const adult = ref(localStorage.getItem('intimate_adult') === 'yes');
function confirmAdult() {
  adult.value = true; localStorage.setItem('intimate_adult', 'yes');
  nextTick(() => document.getElementById('main-content')?.focus());
}
function toggleLocale() { setLocale((locale.value === 'zh' ? 'en' : 'zh') as Locale); }
watch(adult, value => { document.body.style.overflow = value ? '' : 'hidden'; }, { immediate: true });
watch(() => route.fullPath, () => { menu.value = false; document.title = `${String(route.meta.title || 'Explore')} | ${shop.settings?.name || 'The Intimate Edit'}`; });
onMounted(() => shop.load());
</script>

<template>
  <div class="shop-shell">
    <div :inert="!adult || undefined">
    <a href="#main-content" class="skip-link">{{ t('layout.skipToContent') }}</a>
    <div class="announcement"><span>{{ t('layout.announcement1') }}</span><span>{{ t('layout.announcement2') }} <span class="announcement-dot">/</span> USD $</span></div>
    <header class="shop-header">
      <RouterLink class="wordmark" to="/">{{ shop.settings?.name || 'The Intimate Edit' }}<span>{{ t('layout.wordmarkTag') }}</span></RouterLink>
      <nav class="desktop-nav" aria-label="Main navigation">
        <RouterLink to="/shop">{{ t('nav.shopAll') }}</RouterLink>
        <RouterLink to="/shop?category=non-powered">{{ t('nav.nonPowered') }}</RouterLink>
        <RouterLink to="/shop?category=powered">{{ t('nav.powered') }}</RouterLink>
        <RouterLink to="/guide">{{ t('nav.pleasureGuide') }}</RouterLink>
        <RouterLink to="/help">{{ t('nav.ourApproach') }}</RouterLink>
      </nav>
      <div class="header-actions">
        <button class="locale-toggle" :aria-label="locale === 'zh' ? 'Switch to English' : '切换到中文'" @click="toggleLocale">{{ locale === 'zh' ? 'EN' : '中文' }}</button>
        <RouterLink :to="user.isLoggedIn ? '/account' : '/login'" aria-label="Your account"><UserRound :size="20" /></RouterLink>
        <RouterLink to="/cart" aria-label="Shopping bag" class="bag-link"><ShoppingBag :size="20" /><span>{{ shop.count }}</span></RouterLink>
        <button class="mobile-menu icon-button" aria-label="Toggle navigation" :aria-expanded="menu" @click="menu = !menu"><X v-if="menu" :size="22" /><Menu v-else :size="22" /></button>
      </div>
    </header>
    <nav v-if="menu" class="mobile-nav" aria-label="Mobile navigation"><RouterLink to="/shop">{{ t('nav.shopAll') }}</RouterLink><RouterLink to="/shop?category=non-powered">{{ t('nav.nonPowered') }}</RouterLink><RouterLink to="/shop?category=powered">{{ t('nav.powered') }}</RouterLink><RouterLink to="/guide">{{ t('nav.pleasureGuide') }}</RouterLink><RouterLink to="/help">{{ t('nav.helpInfo') }}</RouterLink></nav>
    <div v-if="shop.settings?.demo" class="preview-strip">{{ t('layout.previewStrip') }} <span>{{ t('layout.previewSub') }}</span></div>
    <main id="main-content" tabindex="-1"><slot /></main>
    <footer class="shop-footer">
      <div class="footer-top"><div><p class="eyebrow">{{ t('layout.footerSpace') }}</p><h2>{{ t('layout.footerHead') }}</h2><RouterLink class="text-link" to="/shop">{{ t('layout.footerCta') }} <ArrowUpRight :size="18" /></RouterLink></div>
        <div class="footer-links"><div><h3>{{ t('layout.footerExplore') }}</h3><RouterLink to="/shop">{{ t('nav.shopAll') }}</RouterLink><RouterLink to="/guide">{{ t('layout.footerCare') }}</RouterLink><RouterLink to="/help">{{ t('layout.footerAbout') }}</RouterLink></div><div><h3>{{ t('layout.footerHere') }}</h3><RouterLink to="/track">{{ t('nav.track') }}</RouterLink><RouterLink to="/help/shipping">{{ t('layout.footerShipping') }}</RouterLink><RouterLink to="/help/returns">{{ t('layout.footerReturns') }}</RouterLink><RouterLink to="/help/contact">{{ t('layout.footerContact') }}</RouterLink></div><div><h3>{{ t('layout.footerAccount') }}</h3><RouterLink to="/account">{{ t('layout.footerMyOrders') }}</RouterLink><RouterLink to="/login">{{ t('nav.signIn') }}</RouterLink><RouterLink v-if="user.me?.isAdmin" to="/admin">{{ t('nav.admin') }}</RouterLink></div></div>
      </div>
      <div class="footer-bottom"><span>&copy; {{ new Date().getFullYear() }} {{ shop.settings?.name || 'The Intimate Edit' }}. {{ t('layout.footerAdults') }}</span><div><RouterLink to="/help/privacy">{{ t('layout.footerPrivacy') }}</RouterLink><RouterLink to="/help/terms">{{ t('layout.footerTerms') }}</RouterLink><span>{{ t('layout.footerRegion') }}</span></div></div>
    </footer>
    </div>
    <div v-if="!adult" class="age-overlay"><section class="age-card" role="dialog" aria-modal="true" aria-labelledby="age-title"><p class="eyebrow">{{ t('layout.ageEyebrow') }}</p><h2 id="age-title">{{ t('layout.ageTitle') }}</h2><p>{{ t('layout.ageBody') }}</p><button autofocus class="button primary" @click="confirmAdult">{{ t('layout.ageConfirm') }} <ArrowUpRight :size="18" /></button><a class="text-link" href="https://www.google.com/">{{ t('layout.ageLeave') }}</a><small>{{ t('layout.ageFine') }}</small></section></div>
  </div>
</template>
