// ============================================================
// i18n 入口：加载 locale、持久化语言偏好、暴露切换方法。
// 默认语言 en；用户选择存 localStorage（intimate_locale），
// 通过 setLocale 切换并同步更新 <html lang>。
// ============================================================
import { createI18n } from 'vue-i18n';
import en from './locales/en';
import zh from './locales/zh';

export type Locale = 'en' | 'zh';

const STORAGE_KEY = 'intimate_locale';

export function getSavedLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'zh' || saved === 'en' ? saved : 'en';
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: getSavedLocale(),
  fallbackLocale: 'en',
  messages: { en, zh },
});

/** 切换语言并持久化，同步 <html lang> 属性。 */
export function setLocale(locale: Locale) {
  (i18n.global.locale as any).value = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
}
