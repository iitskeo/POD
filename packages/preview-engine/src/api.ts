import type { DesignElement } from "./design";

/** Un diseno tal como vive en D1. `spec` y `safeAngleDeg` salen del producto. */
export interface StoredDesign {
  id: string;
  productId: string;
  name: string;
  slug: string;
  priceCents: number;
  status: "borrador" | "publicado";
  baseImageKey: string | null;
  elements: DesignElement[];
}

export interface PrintfulStatus {
  connected: boolean;
  storeName: string | null;
  storeId: string | null;
}

export interface CatalogProduct {
  id: number;
  type: string;
  main_category_id: number;
  name: string;
  brand: string | null;
  model: string | null;
  image: string;
  variant_count: number;
  is_discontinued: boolean;
  description: string;
  techniques?: Array<{ key: string; display_name: string }>;
}

export interface CatalogPage {
  data: CatalogProduct[];
  paging?: { total: number; offset: number; limit: number };
}

export interface Category {
  id: number;
  parent_id: number | null;
  title: string;
}

/** Area imprimible de una variante, en pulgadas. */
export interface PlacementDimension {
  placement: string;
  width: number;
  height: number;
  orientation: string;
}

export interface CatalogVariant {
  id: number;
  name: string;
  size: string | null;
  color: string | null;
  color_code: string | null;
  image: string;
  placement_dimensions?: PlacementDimension[];
}

export interface MockupStyle {
  placement: string;
  display_name: string;
  technique: string;
  print_area_width: number;
  print_area_height: number;
  dpi: number;
  mockup_styles?: Array<{ id: number; view_name: string; category_name: string }>;
}

export interface CatalogDetail {
  product: { data?: CatalogProduct } | CatalogProduct;
  styles: { data?: MockupStyle[] } | { error: string };
  variants: { data?: CatalogVariant[]; paging?: { total: number } } | { error: string };
}

/** El precio no viene con el producto: vive por variante y por tecnica. */
export interface ProductPrices {
  currency: string;
  variants: Array<{
    id: number;
    techniques: Array<{ technique_key: string; price: string; discounted_price: string }>;
  }>;
  discount_tiers?: Array<{ quantity: number; bulk_discount_percentage: number }>;
}

/** Precio minimo entre variantes: es el "desde $X" de la tarjeta. */
export function minPrice(p: ProductPrices): number | null {
  const all = p.variants.flatMap((v) => v.techniques.map((t) => Number(t.price)));
  const ok = all.filter((n) => Number.isFinite(n) && n > 0);
  return ok.length ? Math.min(...ok) : null;
}

export class ApiClient {
  constructor(private base: string) {}

  /** URL a la que mandar al admin para arrancar el OAuth. */
  connectUrl() {
    return `${this.base}/api/printful/connect`;
  }

  printfulStatus() {
    return this.req<PrintfulStatus>("/api/printful/status");
  }

  catalog(offset = 0, limit = 20) {
    return this.req<CatalogPage>(`/api/printful/catalog?offset=${offset}&limit=${limit}`);
  }

  categories() {
    return this.req<{ data: Category[] }>("/api/printful/categories");
  }

  /**
   * Trae el catalogo entero.
   *
   * La API v2 no busca por nombre, solo filtra por categoria/color/tecnica. Con ~500
   * productos sale mas barato bajarlos todos una vez y filtrar en el navegador que
   * pegarle a Printful en cada tecla.
   */
  async fullCatalog(onProgress?: (loaded: number, total: number) => void) {
    const first = await this.catalog(0, 100);
    const total = first.paging?.total ?? first.data.length;
    onProgress?.(first.data.length, total);

    const rest = await Promise.all(
      Array.from({ length: Math.ceil((total - 100) / 100) }, (_, i) =>
        this.catalog((i + 1) * 100, 100),
      ),
    );
    const all = [...first.data, ...rest.flatMap((p) => p.data)];
    onProgress?.(all.length, total);
    return all;
  }

  catalogProduct(id: number) {
    return this.req<CatalogDetail>(`/api/printful/catalog/${id}`);
  }

  productPrices(id: number) {
    return this.req<{ data: ProductPrices }>(`/api/printful/catalog/${id}/prices`);
  }

  /** Every variant, paging past Printful's 100 per page cap. */
  async allVariants(id: number, known?: number) {
    const first = await this.req<{ data: CatalogVariant[]; paging?: { total: number } }>(
      `/api/printful/catalog/${id}/variants?offset=0`,
    );
    const total = first.paging?.total ?? known ?? first.data.length;
    if (total <= first.data.length) return first.data;

    const rest = await Promise.all(
      Array.from({ length: Math.ceil((total - 100) / 100) }, (_, i) =>
        this.req<{ data: CatalogVariant[] }>(
          `/api/printful/catalog/${id}/variants?offset=${(i + 1) * 100}`,
        ),
      ),
    );
    return [...first.data, ...rest.flatMap((r) => r.data)];
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  listDesigns(status?: string) {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    return this.req<StoredDesign[]>(`/api/designs${q}`);
  }

  getDesign(id: string) {
    return this.req<StoredDesign>(`/api/designs/${id}`);
  }

  saveDesign(d: StoredDesign) {
    return this.req<StoredDesign>(`/api/designs/${d.id}`, {
      method: "PUT",
      body: JSON.stringify(d),
    });
  }

  deleteDesign(id: string) {
    return this.req<void>(`/api/designs/${id}`, { method: "DELETE" });
  }
}
