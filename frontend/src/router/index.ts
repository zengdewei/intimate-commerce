import { createRouter, createWebHistory } from 'vue-router';
import { useUserStore } from '@/stores/user';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('@/views/shop/Home.vue'), meta: { title: 'Pleasure, on your terms' } },
    { path: '/shop', component: () => import('@/views/shop/Catalog.vue'), meta: { title: 'The collection' } },
    { path: '/products/:slug', component: () => import('@/views/shop/Product.vue'), meta: { title: 'Product details' } },
    { path: '/cart', component: () => import('@/views/shop/Cart.vue'), meta: { title: 'Your bag' } },
    { path: '/checkout', component: () => import('@/views/shop/Checkout.vue'), meta: { title: 'Checkout' } },
    { path: '/orders/:id', component: () => import('@/views/shop/Order.vue'), meta: { title: 'Your order' } },
    ...['login', 'register', 'forgot', 'reset', 'track'].map(path => ({ path: `/${path}`, component: () => import('@/views/shop/Auth.vue'), meta: { title: 'Your personal space' } })),
    { path: '/account', component: () => import('@/views/shop/Account.vue'), meta: { public: false, title: 'Your account' } },
    { path: '/admin', component: () => import('@/views/shop/Admin.vue'), meta: { public: false, admin: true, title: 'Store management' } },
    { path: '/guide', component: () => import('@/views/shop/Information.vue'), meta: { title: 'Care & guidance' } },
    { path: '/help/:page?', component: () => import('@/views/shop/Information.vue'), meta: { title: 'Help & information' } },
    { path: '/:pathMatch(.*)*', component: () => import('@/views/shop/Information.vue'), props: false, beforeEnter: () => ({ path: '/help/not-found' }) },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  const user = useUserStore();
  if (!user.ready) await user.restore();
  if (to.meta.public === false && !user.isLoggedIn) return { path: '/login', query: { redirect: to.fullPath } };
  if (to.meta.admin && !user.me?.isAdmin) return { path: '/account' };
  if ((to.path === '/login' || to.path === '/register') && user.isLoggedIn) return { path: '/account' };
  return true;
});

export default router;
