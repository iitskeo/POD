import { ApiClient } from "@abbiss/preview-engine";

export const api = new ApiClient(
  import.meta.env.VITE_API_BASE ?? "http://localhost:8787",
);
