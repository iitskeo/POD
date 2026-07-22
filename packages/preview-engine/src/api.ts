import type { Asset, Design, Element, Product } from "./types";

export interface ImportResult { productId: string; designId: string }

/** Typed client for the API Worker (docs/pod/05 section 5). Sends the admin cookie. */
export class ApiClient {
  constructor(private base: string) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      credentials: "include",
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  // Admin auth
  login(passphrase: string) {
    return this.req<void>("/api/admin/login", { method: "POST", body: JSON.stringify({ passphrase }) });
  }
  logout() { return this.req<void>("/api/admin/logout", { method: "POST" }); }
  authed() { return this.req<{ authenticated: boolean }>("/api/admin/session").then((r) => r.authenticated); }

  // Printful
  connectUrl() { return `${this.base}/api/printful/connect`; }
  printfulStatus() { return this.req<{ connected: boolean; storeName: string | null }>("/api/printful/status"); }
  catalog(offset = 0, limit = 100) { return this.req<CatalogPage>(`/api/printful/catalog?offset=${offset}&limit=${limit}`); }
  catalogPrices(id: number) { return this.req<{ data: ProductPrices }>(`/api/printful/catalog/${id}/prices`); }
  import(productId: number) { return this.req<ImportResult>("/api/printful/import", { method: "POST", body: JSON.stringify({ productId }) }); }

  async fullCatalog(onProgress?: (n: number, total: number) => void): Promise<CatalogProduct[]> {
    const first = await this.catalog(0, 100);
    const total = first.paging?.total ?? first.data.length;
    onProgress?.(first.data.length, total);
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, Math.ceil((total - 100) / 100)) }, (_, i) => this.catalog((i + 1) * 100, 100)),
    );
    const all = [...first.data, ...rest.flatMap((p) => p.data)];
    onProgress?.(all.length, total);
    return all;
  }

  // Products & designs
  listProducts() { return this.req<Product[]>("/api/products"); }
  product(id: string) { return this.req<Product>(`/api/products/${id}`); }
  productBySlug(slug: string) { return this.req<Product>(`/api/products/slug/${slug}`); }
  patchProduct(id: string, patch: { name?: string; retailPriceCents?: number; status?: string }) {
    return this.req<Product>(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  }
  designForProduct(productId: string) { return this.req<Design>(`/api/designs/product/${productId}`); }
  saveDesign(d: { id: string; productId: string; name: string; status: string; elements: Element[] }) {
    return this.req<Design>(`/api/designs/${d.id}`, { method: "PUT", body: JSON.stringify(d) });
  }

  // Assets, uploads, quick designs
  listAssets(collection?: string) { return this.req<Asset[]>(`/api/assets${collection ? `?collection=${collection}` : ""}`); }
  assetFileUrl(id: string) { return `${this.base}/api/assets/${id}/file`; }
  uploadUrl(id: string) { return `${this.base}/api/uploads/${id}`; }
  async upload(file: File): Promise<{ uploadId: string; url: string; aspect: number }> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${this.base}/api/uploads`, { method: "POST", credentials: "include", body: form });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return res.json();
  }
  async createAsset(file: File, name: string, collection?: string): Promise<Asset> {
    const form = new FormData();
    form.append("file", file); form.append("name", name);
    if (collection) form.append("collection", collection);
    const res = await fetch(`${this.base}/api/assets`, { method: "POST", credentials: "include", body: form });
    if (!res.ok) throw new Error(`Asset upload failed (${res.status})`);
    return res.json();
  }
  listQuickDesigns() { return this.req<QuickDesign[]>("/api/quick-designs"); }
  createQuickDesign(name: string, elements: Element[]) {
    return this.req<QuickDesign>("/api/quick-designs", { method: "POST", body: JSON.stringify({ name, elements }) });
  }

  // Mockup & print files
  async uploadPrintFile(key: string, png: Blob): Promise<{ url: string }> {
    const res = await fetch(`${this.base}/api/print-files/${key}`, {
      method: "PUT", credentials: "include", headers: { "Content-Type": "image/png" }, body: png,
    });
    if (!res.ok) throw new Error(`Print file upload failed (${res.status})`);
    return res.json();
  }
  mockup(productId: string, files: Array<{ placement: string; printFileUrl: string }>) {
    return this.req<string[]>("/api/mockup", { method: "POST", body: JSON.stringify({ productId, files }) });
  }

  // Orders
  createOrder(body: unknown) { return this.req<{ id: string; reference: string; status: string }>("/api/orders", { method: "POST", body: JSON.stringify(body) }); }
  order(reference: string) { return this.req<StoredOrder>(`/api/orders/${reference}`); }

  productPhotoUrl(id: string) { return `${this.base}/api/products/${id}/photo`; }
}

export interface CatalogProduct {
  id: number; type: string; main_category_id: number; name: string;
  brand: string | null; model: string | null; image: string;
  variant_count: number; is_discontinued: boolean; description: string;
}
export interface CatalogPage { data: CatalogProduct[]; paging?: { total: number; offset: number; limit: number } }

export interface ProductPrices {
  currency: string;
  variants: Array<{ id: number; techniques: Array<{ technique_key: string; price: string }> }>;
}
export function minPrice(p: ProductPrices): number | null {
  const all = p.variants.flatMap((v) => v.techniques.map((t) => Number(t.price))).filter((n) => n > 0);
  return all.length ? Math.min(...all) : null;
}

export interface StoredOrder {
  id: string; reference: string; status: string; email: string;
  subtotalCents: number; currency: string;
}

export interface QuickDesign { id: string; name: string; elements: Element[] }
