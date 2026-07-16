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

export class ApiClient {
  constructor(private base: string) {}

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
