<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowRight } from 'lucide-vue-next';
import { useUserStore } from '@/stores/user';
import { errorMessage } from '@/stores/shop';
import api from '@/lib/axios';
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
      message.value = (res.data && res.data.message) || 'If an account matches, a reset code was emailed. Use it below to set a new password.';
      return;
    }
    if (mode.value === 'reset') {
      await api.post('/auth/reset-password', { email: form.email, code: form.code, newPassword: form.password });
      message.value = 'Password changed. Redirecting you to sign in…';
      setTimeout(() => router.replace('/login'), 1200);
      return;
    }
    if (mode.value === 'register') {
      if (form.password !== form.confirm) throw new Error('Passwords do not match.');
      await user.register({ email: form.email, password: form.password, fullName: form.fullName });
    } else await user.login({ email: form.email, password: form.password });
    const r = route.query.redirect;
    router.replace(typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') ? r : '/account');
  } catch (e) { error.value = errorMessage(e); }
  finally { busy.value = false; }
}
const submitLabel = computed(() => ({
  login: 'Sign in', register: 'Create account', reset: 'Change password',
  forgot: 'Email reset code', track: 'Email order link',
}[mode.value] || 'Continue'));
const headings: Record<string, string> = { login: 'Welcome back.', register: 'A space of your own.', forgot: 'A fresh start.', reset: 'Set a new password.', track: 'Find your order.' };
</script>
<template>
  <section class="auth-page"><div class="auth-aside"><p class="eyebrow">ON YOUR TERMS</p><h2>A little more<br>comfort.<br><em>A little more you.</em></h2><p>Your orders, your details, your own space to explore.</p></div>
    <div class="auth-form"><p class="eyebrow">{{ mode === 'track' ? 'PRIVATE ORDER ACCESS' : 'YOUR ACCOUNT' }}</p><h1>{{ headings[mode] }}</h1>
      <p v-if="mode === 'track'" class="muted">Enter the email and order number used at checkout. We'll email you a private access link (valid 30 days).</p>
      <p v-if="mode === 'forgot'" class="muted">Enter the email tied to your account. We'll send a short reset code that expires in 15 minutes.</p>
      <p v-if="mode === 'reset'" class="muted">Paste the reset code from your email, then choose a new password (8 characters or longer).</p>
      <form @submit.prevent="submit">
        <label v-if="mode === 'register'" class="field">Full name<input v-model="form.fullName" required minlength="2" maxlength="100" autocomplete="name"></label>
        <label class="field">Email<input v-model="form.email" type="email" required autocomplete="email"></label>
        <label v-if="['reset', 'track'].includes(mode)" class="field">{{ mode === 'track' ? 'Order number' : 'Reset code' }}<input v-model="form.code" required :maxlength="mode === 'track' ? 80 : 6"></label>
        <label v-if="['login', 'register', 'reset'].includes(mode)" class="field">Password<input v-model="form.password" type="password" required minlength="8" maxlength="72" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"></label>
        <label v-if="mode === 'register'" class="field">Confirm password<input v-model="form.confirm" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></label>
        <label v-if="mode === 'register'" class="checkbox-field"><input type="checkbox" required><span>I am 18+ and agree to the <RouterLink to="/help/terms">Terms</RouterLink> and <RouterLink to="/help/privacy">Privacy Policy</RouterLink>.</span></label>
        <p v-if="error" class="notice error" role="alert">{{ error }}</p>
        <div v-if="message" class="notice success" role="status">
          <p>{{ message }}</p>
          <div v-if="mode === 'forgot' || mode === 'track'" class="inline-actions">
            <RouterLink v-if="mode === 'forgot'" class="button secondary" to="/reset">Enter reset code</RouterLink>
            <RouterLink class="text-link" to="/login">Back to sign in</RouterLink>
          </div>
        </div>
        <button class="button primary full" :disabled="busy">{{ busy ? 'Please wait...' : submitLabel }}<ArrowRight :size="18" /></button>
      </form>
      <div class="auth-links">
        <RouterLink v-if="mode === 'login'" to="/forgot">Forgot password?</RouterLink>
        <RouterLink v-if="mode === 'login'" to="/register">Create an account</RouterLink>
        <RouterLink v-else-if="mode !== 'reset'" to="/login">Back to sign in</RouterLink>
        <RouterLink v-if="mode === 'reset'" to="/forgot">Send a new code</RouterLink>
        <RouterLink v-if="mode === 'forgot'" to="/reset">I already have a code</RouterLink>
      </div>
    </div>
  </section>
</template>
<style scoped>
.muted { color: var(--muted-text); font-size: 14px; }
.inline-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 8px; }
</style>
