/// <reference types="vite/client" />
/// <reference types="vue/jsx" />

import type { DefineComponent } from 'vue';
import type { Router, RouteLocationNormalizedLoaded } from 'vue-router';

type TranslateFn = (key: string, ...args: any[]) => string;

declare module '*.vue' {
  const component: DefineComponent<Record<string, any>, Record<string, any>, any>;
  export default component;
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $router: Router;
    $route: RouteLocationNormalizedLoaded;
    $t: TranslateFn;
  }
}

declare global {
  const $t: TranslateFn;
  const $router: Router;
  const $route: RouteLocationNormalizedLoaded;

  interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string;
    readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
