import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import api from '@/lib/axios';

export interface Variant { id: string; sku: string; label: string; price: number; stock: number; active: boolean }
export interface Product {
  id: string; slug: string; name: string; category: string; description: string; material: string;
  dimensions: string; care: string; images: string[]; demo: boolean; active: boolean; featured: boolean; variants: Variant[];
}
export interface CartItem { variantId: string; quantity: number; name: string; label: string; price: number; slug: string }
export const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100);
export const categoryName = (s: string) => ({ 'non-powered': 'Non-powered essentials', powered: 'Powered pleasure' }[s] || s);
export const errorMessage = (e: any) => {
  const m = e.response?.data?.message;
  return Array.isArray(m) ? m.join('. ') : m || e.message || 'Something went wrong. Please try again.';
};
export const editorialImage = 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=' + encodeURIComponent(
  'Luxury editorial still life photography for a feminine wellness lifestyle website, sculptural cream ceramic vase with one dark burgundy calla lily, folded mauve linen and smooth rose quartz stones on a warm pink travertine table, soft natural window light, rich wine colored background, sophisticated minimalist art direction, subtle film grain, no text, no logos, no people, landscape composition'
) + '&image_size=landscape_4_3';

export const useShopStore = defineStore('shop', () => {
  const products = ref<Product[]>([]);
  const settings = ref<any>(null);
  const error = ref('');
  const loading = ref(false);
  const cart = ref<CartItem[]>([]);
  try {
    const saved = JSON.parse(localStorage.getItem('intimate_cart') || '[]');
    if (Array.isArray(saved)) cart.value = saved.filter(i => typeof i.variantId === 'string' && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 10);
  } catch {}
  const count = computed(() => cart.value.reduce((n, i) => n + i.quantity, 0));
  const subtotal = computed(() => cart.value.reduce((n, i) => n + i.quantity * i.price, 0));
  let initialized = false;
  async function load(force = false) {
    if ((initialized && !force) || loading.value) return;
    loading.value = true; error.value = '';
    try {
      const [p, s] = await Promise.all([api.get('/store/products'), api.get('/store/settings')]);
      products.value = p.data; settings.value = s.data; initialized = true;
    } catch (e) { error.value = errorMessage(e); }
    finally { loading.value = false; }
  }
  function persist() { localStorage.setItem('intimate_cart', JSON.stringify(cart.value)); }
  function add(product: Product, variant: Variant, quantity: number) {
    const existing = cart.value.find(i => i.variantId === variant.id);
    if ((existing?.quantity || 0) + quantity > Math.min(10, variant.stock)) throw new Error('That quantity is not available.');
    if (existing) existing.quantity += quantity;
    else cart.value.push({ variantId: variant.id, quantity, name: product.name, label: variant.label, price: variant.price, slug: product.slug });
    persist();
  }
  function update(id: string, quantity: number) {
    if (quantity <= 0) cart.value = cart.value.filter(i => i.variantId !== id);
    else { const item = cart.value.find(i => i.variantId === id); if (item) item.quantity = Math.min(10, Math.floor(quantity)); }
    persist();
  }
  function clear() { cart.value = []; persist(); }
  return { products, settings, error, loading, cart, count, subtotal, load, add, update, clear };
});
