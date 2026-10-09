<template>
  <footer class="mt-24 border-t border-slate-200 bg-white py-10 text-sm text-slate-500">
    <div class="container grid md:grid-cols-3 gap-6">
      <div>
        <div class="font-bold text-slate-700 mb-2">ProxyService</div>
        <p>Buy clean static residential & dedicated IPs. Instant delivery, world-class uptime.</p>
      </div>
      <div>
        <div class="font-semibold text-slate-700 mb-2">Product</div>
        <ul class="space-y-1">
          <li><router-link to="/pricing">Pricing</router-link></li>
          <li><router-link to="/">Features</router-link></li>
        </ul>
      </div>
      <div>
        <div class="font-semibold text-slate-700 mb-2">Support</div>
        <ul class="space-y-1">
          <li><a href="mailto:support@example.com">Email support</a></li>
          <li>© {{ year }} ProxyService. All rights reserved.</li>
        </ul>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
const year = new Date().getFullYear();
</script>
