import type { DesignElement } from "./design";
import type { PrintSpec } from "./types";

/** A design as it lives in D1. `spec` and `safeAngleDeg` come from the product. */
export interface StoredDesign {
  id: string;
  productId: string;
  name: string;
  slug: string;
  priceCents: number;
  status: "draft" | "published";
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

/** Printable area of a variant, in inches. */
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

/** Price does not ship with the product: it lives per variant and per technique. */
export interface ProductPrices {
  currency: string;
  variants: Array<{
    id: number;
    techniques: Array<{ technique_key: string; price: string; discounted_price: string }>;
  }>;
  discount_tiers?: Array<{ quantity: number; bulk_discount_percentage: number }>;
}

/** Minimum price across variants: the card's "from $X". */
export function minPrice(p: ProductPrices): number | null {
  const all = p.variants.flatMap((v) => v.techniques.map((t) => Number(t.price)));
  const ok = all.filter((n) => Number.isFinite(n) && n > 0);
  return ok.length ? Math.min(...ok) : null;
}

/** A product as it lives in D1, after import. */
export interface StoredProduct {
  id: string;
  name: string;
  slug: string;
  status: string;
  source: string;
  externalProductId: string | null;
  externalVariantId: string | null;
  surface: "revolution" | "flat";
  hasPhoto: boolean;
  printBand: { yStart: number; height: number } | null;
  calibration: { shadingStrength: number; safeAngleDeg: number } | null;
  printSpec: PrintSpec;
}

export interface ImportedProduct {
  id: string;
  name: string;
  photoKey: string;
  printSpec: PrintSpec;
  surface: string;
  technique: string;
}

export class ApiClient {
  constructor(private base: string) {}

  /** URL to send the admin to in order to start OAuth. */
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
   * Fetches the whole catalog.
   *
   * The v2 API has no name search, only category/color/technique filters. At ~500
   * products it is cheaper to pull them all once and filter in the browser than to
   * hit Printful on every keystroke.
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

  /**
   * Imports a catalog product.
   *
   * `photoUrl` is chosen by the admin: the engine needs the product front-on against
   * a flat background, and the catalog mixes in angles, props and lifestyle shots.
   */
  importProduct(input: { productId: number; variantId?: number; photoUrl: string; name?: string }) {
    return this.req<ImportedProduct>("/api/printful/import", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listProducts() {
    return this.req<StoredProduct[]>("/api/products");
  }

  productPhotoUrl(id: string) {
    return `${this.base}/api/products/${id}/photo`;
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
