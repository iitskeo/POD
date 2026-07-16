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
  name: string;
  brand: string | null;
  image: string;
  variant_count: number;
}

export interface CatalogPage {
  data: CatalogProduct[];
  paging?: { total: number; offset: number; limit: number };
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

  catalogProduct(id: number) {
    return this.req<{ product: unknown; styles: unknown }>(`/api/printful/catalog/${id}`);
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
