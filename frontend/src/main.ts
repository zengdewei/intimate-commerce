import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import App from './App.vue';
import router from './router';
import './styles/index.css';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';

const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: 'en',
  messages: {
    en: {
      nav: { home: 'Home', pricing: 'Pricing', dashboard: 'Dashboard', login: 'Sign in', register: 'Sign up', my_ips: 'My IPs', logout: 'Sign out' },
      common: { buy:'Buy now', loading:'Loading...', submit:'Submit', save:'Save', cancel:'Cancel', copy:'Copy', copied:'Copied',
        email:'Email', password:'Password', name:'Name', actions:'Actions', cancel_order:'Cancel' }
    }
  }
});

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } } });

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.use(VueQueryPlugin, { queryClient });
app.mount('#app');
