<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useShopStore, money } from '@/stores/shop';
const { t } = useI18n();
const route = useRoute();
const shop = useShopStore();
const page = computed(() => String(route.params.page || (route.path === '/guide' ? 'guide' : 'about')));
const titles = computed<Record<string, string>>(() => ({
  about: t('info.aboutTitle'), guide: t('info.guideTitle'), shipping: t('info.shippingTitle'),
  returns: t('info.returnsTitle'), privacy: t('info.privacyTitle'), terms: t('info.termsTitle'),
  contact: t('info.contactTitle'), faq: t('info.faqTitle'),
}));
</script>
<template>
  <section class="section-wrap information-page"><aside class="information-nav"><p class="eyebrow">{{ t('info.eyebrow') }}</p><RouterLink to="/help">{{ t('info.ourApproach') }}</RouterLink><RouterLink to="/guide">{{ t('info.careGuidance') }}</RouterLink><RouterLink to="/help/shipping">{{ t('info.shipping') }}</RouterLink><RouterLink to="/help/returns">{{ t('info.returnsSupport') }}</RouterLink><RouterLink to="/help/faq">{{ t('info.faq') }}</RouterLink><RouterLink to="/help/privacy">{{ t('info.privacy') }}</RouterLink><RouterLink to="/help/terms">{{ t('info.terms') }}</RouterLink><RouterLink to="/help/contact">{{ t('info.contact') }}</RouterLink></aside>
    <article class="prose"><p class="eyebrow">{{ t('info.brandEyebrow') }}</p><h1>{{ titles[page] || t('info.pageNotFound') }}</h1>
      <template v-if="page === 'about'"><p class="lead">{{ t('info.aboutLead') }}</p><p>{{ t('info.aboutBody') }}</p><h2>{{ t('info.aboutH2') }}</h2><p>{{ t('info.aboutBody2') }}</p><RouterLink class="button primary" to="/shop">{{ t('common.explore') }}</RouterLink></template>
      <template v-else-if="page === 'guide'"><p class="lead">{{ t('info.guideLead') }}</p><h2>{{ t('info.guideH2a') }}</h2><p>{{ t('info.guideP1') }}</p><h2>{{ t('info.guideH2b') }}</h2><p>{{ t('info.guideP2') }}</p><h2>{{ t('info.guideH2c') }}</h2><p>{{ t('info.guideP3') }}</p><h2>{{ t('info.guideH2d') }}</h2><p>{{ t('info.guideP4') }}</p></template>
      <template v-else-if="page === 'shipping'"><p class="lead">{{ t('info.shippingLead') }}</p><p>{{ shop.settings?.shippingNotice }}</p><h2>{{ t('info.shippingDeliveryArea') }}</h2><p>{{ t('info.shippingDeliveryBody') }}</p><h2>{{ t('info.shippingCharges') }}</h2><p v-if="shop.settings">{{ shop.settings.demo ? t('info.shippingPreviewRates') : '' }}{{ money(shop.settings.shipping) }} {{ t('info.shippingStandard') }} {{ money(shop.settings.freeShippingAt) }} {{ t('info.shippingAfterDiscounts') }}</p><h2>{{ t('info.shippingTracking') }}</h2><p>{{ t('info.shippingTrackingBody') }}</p><p v-if="shop.settings?.discreetPackaging">{{ t('info.shippingDiscreet') }}</p><p v-else>{{ t('info.shippingPackagingPending') }}</p></template>
      <template v-else-if="page === 'returns'"><p>{{ shop.settings?.returnsNotice }}</p><h2>{{ t('info.returnsRequestHelp') }}</h2><p>{{ t('info.returnsBody') }}</p><p>{{ t('info.returnsWarning') }}</p><RouterLink class="button secondary" to="/track">{{ t('info.returnsFindOrder') }}</RouterLink></template>
      <template v-else-if="page === 'privacy'"><p>{{ shop.settings?.privacyNotice }}</p><h2>{{ t('info.privacyNecessary') }}</h2><p>{{ t('info.privacyNecessaryBody') }}</p><h2>{{ t('info.privacyOrderInfo') }}</h2><p>{{ t('info.privacyOrderBody') }}</p><h2>{{ t('info.privacyLinks') }}</h2><p>{{ t('info.privacyLinksBody') }}</p><h2>{{ t('info.privacyRights') }}</h2><p>{{ t('info.privacyRightsBody') }}</p></template>
      <template v-else-if="page === 'terms'"><p>{{ shop.settings?.termsNotice }}</p><p>{{ t('info.termsAdult') }}</p><p>{{ t('info.termsSeparate') }}</p><p v-if="shop.settings?.demo" class="notice">{{ t('info.termsPreview') }}</p></template>
      <template v-else-if="page === 'faq'"><details open><summary>{{ t('info.faqQ1') }}</summary><p>{{ t('info.faqA1') }}</p></details><details><summary>{{ t('info.faqQ2') }}</summary><p>{{ t('info.faqA2') }}</p></details><details><summary>{{ t('info.faqQ3') }}</summary><p>{{ t('info.faqA3') }}</p><RouterLink class="text-link" to="/track">{{ t('info.faqFindOrder') }}</RouterLink></details><details><summary>{{ t('info.faqQ4') }}</summary><p>{{ t('info.faqA4') }}</p></details></template>
      <template v-else-if="page === 'contact'"><p class="lead">{{ t('info.contactLead') }}</p><p v-if="shop.settings?.supportEmail">{{ t('info.contactEmail') }} <a :href="`mailto:${shop.settings.supportEmail}`">{{ shop.settings.supportEmail }}</a>。</p><p v-else>{{ t('info.contactPending') }}</p><p>{{ t('info.contactNote') }}</p><RouterLink class="button secondary" to="/track">{{ t('info.contactOrderHelp') }}</RouterLink></template>
      <template v-else><p>{{ t('info.notFound') }}</p><RouterLink class="button primary" to="/">{{ t('info.backHome') }}</RouterLink></template>
    </article>
  </section>
</template>
