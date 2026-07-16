import type { ApiClient, CatalogPage, PrintfulStatus } from "@abbiss/preview-engine";
import { useCallback, useEffect, useState } from "react";

interface Props {
  api: ApiClient;
}

const PAGE = 20;

export function Productos({ api }: Props) {
  const [status, setStatus] = useState<PrintfulStatus | null>(null);
  const [page, setPage] = useState<CatalogPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // El callback del OAuth vuelve al admin con ?printful=...
  const [aviso, setAviso] = useState<string | null>(() => {
    const q = new URLSearchParams(location.search);
    const p = q.get("printful");
    if (!p) return null;
    history.replaceState({}, "", location.pathname);
    if (p === "conectado") return "Printful conectado.";
    if (p === "rechazado") return "Cancelaste la conexion con Printful.";
    return `Printful fallo: ${q.get("msg") ?? "error"}`;
  });

  useEffect(() => {
    api.printfulStatus().then(setStatus).catch((e) => setError(String(e.message ?? e)));
  }, [api]);

  const load = useCallback(
    async (off: number) => {
      setLoading(true);
      setError(null);
      try {
        setPage(await api.catalog(off, PAGE));
        setOffset(off);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (status?.connected) load(0);
  }, [status?.connected, load]);

  if (!status) return <p className="hint">Consultando estado...</p>;

  if (!status.connected) {
    return (
      <div className="connect-card">
        {aviso && <p className="hint" style={{ marginBottom: 12 }}>{aviso}</p>}
        <span className="eyebrow">Proveedor</span>
        <h2 className="connect-title">Conecta tu tienda de Printful</h2>
        <p className="hint" style={{ maxWidth: "42ch", marginBottom: 16 }}>
          Un click y traemos el catalogo. El token se queda en el servidor: ni el
          navegador ni el codigo lo ven nunca.
        </p>
        <a className="cta" href={api.connectUrl()}>Conectar Printful</a>
        {error && <p className="hint" style={{ color: "var(--senal)" }}>{error}</p>}
      </div>
    );
  }

  const total = page?.paging?.total ?? 0;

  return (
    <div className="catalogo">
      <div className="catalogo-head">
        <div>
          <span className="eyebrow">Catalogo de Printful</span>
          <p className="hint">
            {aviso ? `${aviso} ` : ""}
            {total ? `${total} productos. Elige cual importar.` : "Cargando catalogo..."}
          </p>
        </div>
        <div className="pager">
          <button className="btn" disabled={offset === 0 || loading} onClick={() => load(Math.max(0, offset - PAGE))}>
            Anterior
          </button>
          <span className="hint">
            {offset + 1}&ndash;{Math.min(offset + PAGE, total || offset + PAGE)}
          </span>
          <button className="btn" disabled={loading || (!!total && offset + PAGE >= total)} onClick={() => load(offset + PAGE)}>
            Siguiente
          </button>
        </div>
      </div>

      {error && <p className="hint" style={{ color: "var(--senal)" }}>{error}</p>}

      <div className="cat-grid">
        {page?.data.map((p) => (
          <article className="cat-card" key={p.id}>
            <div className="cat-img">
              <img src={p.image} alt={p.name} />
            </div>
            <h3>{p.name}</h3>
            <p className="hint">
              {p.brand ?? "Printful"} &middot; {p.variant_count} variantes
            </p>
            <button className="btn wide" disabled title="Proximo paso: importar y calibrar">
              Importar
            </button>
          </article>
        ))}
      </div>
      {loading && <p className="hint">Cargando...</p>}
    </div>
  );
}
