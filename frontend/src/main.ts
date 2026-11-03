import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { i18n } from './i18n';
import './styles/index.css';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } } });

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.use(VueQueryPlugin, { queryClient });
app.mount('#app');
