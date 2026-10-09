<template>
  <header class="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-200">
    <div class="container h-16 flex items-center justify-between">
      <router-link to="/" class="flex items-center gap-2 font-bold text-lg">
        <span class="inline-block w-8 h-8 rounded-lg bg-brand-600 text-white grid place-items-center">PX</span>
        <span>ProxyService</span>
      </router-link>

      <nav class="hidden md:flex items-center gap-6 text-sm text-slate-600">
        <router-link to="/" exact-active-class="text-brand-600">{{ $t('nav.home') }}</router-link>
        <router-link to="/pricing" active-class="text-brand-600">{{ $t('nav.pricing') }}</router-link>
        <template v-if="user.isLoggedIn">
          <router-link to="/dashboard/my-ips" active-class="text-brand-600">{{ $t('nav.my_ips') }}</router-link>
        </template>
      </nav>

      <div class="flex items-center gap-2">
        <template v-if="user.isLoggedIn">
          <span v-if="user.me" class="hidden sm:inline text-sm text-slate-600 mr-2">Hi, {{ user.me.fullName || user.me.email }}</span>
          <button v-if="user.me?.isAdmin" as="router-link" class="btn-ghost hidden lg:inline-flex" @click="$router.push('/dashboard/my-ips')">
            Admin
          </button>
          <button class="btn-ghost" @click="handleLogout">{{ $t('nav.logout') }}</button>
        </template>
        <template v-else>
          <router-link to="/login" class="btn-ghost">{{ $t('nav.login') }}</router-link>
          <router-link to="/register" class="btn-primary">{{ $t('nav.register') }}</router-link>
        </template>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useUserStore } from '@/stores/user';
const user = useUserStore();
function handleLogout() {
  user.logout();
  window.location.href = '/';
}
</script>
