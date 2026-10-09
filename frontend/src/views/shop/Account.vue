<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { money, errorMessage } from '@/stores/shop';
import api from '@/lib/axios';

const user = useUserStore();
const router = useRouter();
const orders = ref<any[]>([]);
const error = ref('');
const loading = ref(true);
const tab = ref<'orders' | 'profile'>('orders');

const profile = reactive({ fullName: '', timezone: 'UTC' });
const profileSaving = ref(false);
const profileMsg = ref('');
const profileErr = ref('');

const password = reactive({ currentPassword: '', newPassword: '', confirm: '' });
const passwordSaving = ref(false);
const passwordMsg = ref('');
const passwordErr = ref('');

onMounted(async () => {
  try {
    orders.value = (await api.get('/store/my-orders')).data;
    if (user.me) {
      profile.fullName = user.me.fullName || '';
      profile.timezone = (user.me as any).timezone || 'UTC';
    }
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
});

async function saveProfile() {
  profileErr.value = ''; profileMsg.value = ''; profileSaving.value = true;
  try {
    const { data } = await api.patch('/auth/me', { fullName: profile.fullName || null, timezone: profile.timezone });
    if (user.me) { user.me.fullName = data.data.fullName; (user.me as any).timezone = data.data.timezone; }
    profileMsg.value = 'Profile saved.';
  } catch (e) {
    profileErr.value = errorMessage(e);
  } finally {
    profileSaving.value = false;
  }
}

async function savePassword() {
  passwordErr.value = ''; passwordMsg.value = '';
  if (password.newPassword.length < 8) { passwordErr.value = 'New password must be at least 8 characters.'; return; }
  if (password.newPassword !== password.confirm) { passwordErr.value = 'Passwords do not match.'; return; }
  passwordSaving.value = true;
  try {
    await api.patch('/auth/password', { currentPassword: password.currentPassword, newPassword: password.newPassword });
    password.currentPassword = ''; password.newPassword = ''; password.confirm = '';
    passwordMsg.value = 'Password updated.';
  } catch (e) {
    passwordErr.value = errorMessage(e);
  } finally {
    passwordSaving.value = false;
  }
}

function logout() { user.logout(); router.push('/'); }
</script>

<template>
  <section class="section-wrap">
    <div class="section-heading">
      <div>
        <p class="eyebrow">YOUR PERSONAL SPACE</p>
        <h1>Hello, {{ user.me?.fullName || 'you' }}.</h1>
      </div>
      <button class="text-link" @click="logout">Sign out</button>
    </div>

    <div class="filter-tabs account-tabs">
      <button :class="{ selected: tab === 'orders' }" @click="tab = 'orders'">Your orders</button>
      <button :class="{ selected: tab === 'profile' }" @click="tab = 'profile'">Profile &amp; password</button>
      <RouterLink v-if="user.me?.isAdmin" to="/admin">Store management</RouterLink>
    </div>

    <div v-if="tab === 'orders'">
      <p v-if="error" class="notice error">{{ error }}</p>
      <p v-else-if="loading">Loading your orders...</p>
      <div v-else-if="!orders.length" class="empty-state">
        <h2>Your story starts here.</h2>
        <p>No account orders yet. Guest orders can be found using your private email link.</p>
        <RouterLink class="button primary" to="/shop">Explore the collection</RouterLink>
        <RouterLink class="text-link" to="/track">Find a guest order</RouterLink>
      </div>
      <div v-else class="table-wrap">
        <table>
          <thead><tr><th>Order</th><th>Date</th><th>Payment</th><th>Dispatch</th><th>Total</th><th></th></tr></thead>
          <tbody>
            <tr v-for="o in orders" :key="o.id">
              <td>{{ o.number }}</td>
              <td>{{ new Date(o.createdAt).toLocaleDateString() }}</td>
              <td><span class="status-chip">{{ o.paymentStatus }}</span></td>
              <td>{{ o.fulfillmentStatus }}</td>
              <td>{{ money(o.total) }}</td>
              <td><RouterLink class="text-link" :to="`/orders/${o.id}`">View order</RouterLink></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else class="profile-grid">
      <form class="card" @submit.prevent="saveProfile">
        <h2>Profile</h2>
        <label><span>Display name</span><input v-model="profile.fullName" type="text" maxlength="80" placeholder="Optional"></label>
        <label><span>Timezone</span><input v-model="profile.timezone" type="text" maxlength="40" placeholder="UTC"></label>
        <p v-if="profileMsg" class="notice ok">{{ profileMsg }}</p>
        <p v-if="profileErr" class="notice error">{{ profileErr }}</p>
        <button class="button primary" type="submit" :disabled="profileSaving">{{ profileSaving ? 'Saving…' : 'Save profile' }}</button>
      </form>

      <form class="card" @submit.prevent="savePassword">
        <h2>Change password</h2>
        <label><span>Current password</span><input v-model="password.currentPassword" type="password" autocomplete="current-password" required></label>
        <label><span>New password (min. 8 chars)</span><input v-model="password.newPassword" type="password" autocomplete="new-password" minlength="8" required></label>
        <label><span>Confirm new password</span><input v-model="password.confirm" type="password" autocomplete="new-password" minlength="8" required></label>
        <p v-if="passwordMsg" class="notice ok">{{ passwordMsg }}</p>
        <p v-if="passwordErr" class="notice error">{{ passwordErr }}</p>
        <button class="button primary" type="submit" :disabled="passwordSaving">{{ passwordSaving ? 'Updating…' : 'Update password' }}</button>
      </form>
    </div>
  </section>
</template>

<style scoped>
.profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.card { padding: 24px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); display: flex; flex-direction: column; gap: 14px; }
.card h2 { margin: 0; font-size: 20px; }
.card label { display: flex; flex-direction: column; gap: 6px; font-size: 14px; color: var(--muted-text); }
.card input { padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); font-size: 15px; }
@media (max-width: 900px) { .profile-grid { grid-template-columns: 1fr; } }
</style>
