<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowRight } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@/stores/user';
import { errorMessage } from '@/stores/shop';
import api from '@/lib/axios';
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const user = useUserStore();
const mode = computed(() => route.path.slice(1));
const form = reactive({ email: '', password: '', fullName: '', code: '', confirm: '' });
const error = ref('');
const message = ref('');
const busy = ref(false);
watch(mode, () => { error.value = ''; message.value = ''; busy.value = false; });
async function submit() {
  busy.value = true; error.value = ''; message.value = '';
  try {
    if (mode.value === 'track') {
      message.value = (await api.post('/store/recover', { email: form.email, number: form.code })).data.message;
      return;
    }
    if (mode.value === 'forgot') {
      const res = await api.post('/auth/request-reset', { email: form.email });
      message.value = (res.data && res.data.message) || t('auth.resetSent');
      return;
    }
    if (mode.value === 'reset') {
      await api.post('/auth/reset-password', { email: form.email, code: form.code, newPassword: form.password });
      message.value = t('auth.passwordChanged');
      setTimeout(() => router.replace('/login'), 1200);
      return;
    }
    if (mode.value === 'register') {
      if (form.password !== form.confirm) throw new Error(t('auth.pwMismatch'));
      await user.register({ email: form.email, password: form.password, fullName: form.fullName });
    } else await user.login({ email: form.email, password: form.password });
    const r = route.query.redirect;
    router.replace(typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') ? r : '/account');
  } catch (e) { error.value = errorMessage(e); }
  finally { busy.value = false; }
}
const submitLabel = computed(() => ({
  login: t('auth.signIn'), register: t('auth.createAccount'), reset: t('auth.changePassword'),
  forgot: t('auth.emailResetCode'), track: t('auth.emailOrderLink'),
}[mode.value] || t('common.continue')));
const headings = computed<Record<string, string>>(() => ({ login: t('auth.login'), register: t('auth.register'), forgot: t('auth.forgot'), reset: t('auth.reset'), track: t('auth.track') }));
</script>
<template>
  <section class="auth-page"><div class="auth-aside"><p class="eyebrow">{{ t('auth.asideEyebrow') }}</p><h2>{{ t('auth.asideTitle') }}</h2><p>{{ t('auth.asideBody') }}</p></div>
    <div class="auth-form"><p class="eyebrow">{{ mode === 'track' ? t('auth.privateAccess') : t('auth.yourAccount') }}</p><h1>{{ headings[mode] }}</h1>
      <p v-if="mode === 'track'" class="muted">{{ t('auth.trackHint') }}</p>
      <p v-if="mode === 'forgot'" class="muted">{{ t('auth.forgotHint') }}</p>
      <p v-if="mode === 'reset'" class="muted">{{ t('auth.resetHint') }}</p>
      <form @submit.prevent="submit">
        <label v-if="mode === 'register'" class="field">{{ t('auth.fullName') }}<input v-model="form.fullName" required minlength="2" maxlength="100" autocomplete="name"></label>
        <label class="field">{{ t('auth.email') }}<input v-model="form.email" type="email" required autocomplete="email"></label>
        <label v-if="['reset', 'track'].includes(mode)" class="field">{{ mode === 'track' ? t('auth.orderNumber') : t('auth.resetCode') }}<input v-model="form.code" required :maxlength="mode === 'track' ? 80 : 6"></label>
        <label v-if="['login', 'register', 'reset'].includes(mode)" class="field">{{ t('auth.password') }}<input v-model="form.password" type="password" required minlength="8" maxlength="72" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"></label>
        <label v-if="mode === 'register'" class="field">{{ t('auth.confirmPassword') }}<input v-model="form.confirm" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></label>
        <label v-if="mode === 'register'" class="checkbox-field"><input type="checkbox" required><span>{{ t('auth.adultAgree') }} <RouterLink to="/help/terms">{{ t('checkout.terms') }}</RouterLink> {{ t('checkout.and') }} <RouterLink to="/help/privacy">{{ t('checkout.privacyPolicy') }}</RouterLink>.</span></label>
        <p v-if="error" class="notice error" role="alert">{{ error }}</p>
        <div v-if="message" class="notice success" role="status">
          <p>{{ message }}</p>
          <div v-if="mode === 'forgot' || mode === 'track'" class="inline-actions">
            <RouterLink v-if="mode === 'forgot'" class="button secondary" to="/reset">{{ t('auth.enterResetCode') }}</RouterLink>
            <RouterLink class="text-link" to="/login">{{ t('auth.backToSignIn') }}</RouterLink>
          </div>
        </div>
        <button class="button primary full" :disabled="busy">{{ busy ? t('order.pleaseWait') : submitLabel }}<ArrowRight :size="18" /></button>
      </form>
      <div class="auth-links">
        <RouterLink v-if="mode === 'login'" to="/forgot">{{ t('auth.forgotPassword') }}</RouterLink>
        <RouterLink v-if="mode === 'login'" to="/register">{{ t('auth.createAccount') }}</RouterLink>
        <RouterLink v-else-if="mode !== 'reset'" to="/login">{{ t('auth.backToSignIn') }}</RouterLink>
        <RouterLink v-if="mode === 'reset'" to="/forgot">{{ t('auth.sendNewCode') }}</RouterLink>
        <RouterLink v-if="mode === 'forgot'" to="/reset">{{ t('auth.haveCode') }}</RouterLink>
      </div>
    </div>
  </section>
</template>
<style scoped>
.muted { color: var(--muted-text); font-size: 14px; }
.inline-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 8px; }
</style>
