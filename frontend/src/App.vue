<template>
  <ShopLayout>
    <RouterView :key="$route.path" />
  </ShopLayout>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
import ShopLayout from '@/components/shop/ShopLayout.vue';
</script>
