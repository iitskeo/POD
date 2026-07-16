import type { ApiClient, CatalogProduct, Category, PrintfulStatus } from "@abbiss/preview-engine";
import { useEffect, useMemo, useState } from "react";

interface Props {
  api: ApiClient;
}

type Orden = "nombre" | "variantes" | "categoria";

/** categoria -> su raiz, subiendo por parent_id. Un producto cuelga de una hoja. */
function rootOf(id: number, byId: Map<number, Category>): number {
  let cur = byId.get(id);
  const seen = new Set<number>();
  while (cur?.parent_id && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId.get(cur.parent_id);
  }
  return cur?.id ?? id;
}

export function Productos({ api }: Props) {
  const [status, setStatus] = useState<PrintfulStatus | null>(null);
  const [items, setItems] = useState<CatalogProduct[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [progreso, setProgreso] = useState({ loaded: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [catId, setCatId] = useState<number | null>(null);
  const [orden, setOrden] = useState<Orden>("nombre");
  const [verDescontinuados, setVerDescontinuados] = useState(false);

  const [aviso, setAviso] = useState<string | null>(() => {
    const p = new URLSearchParams(location.search);
    const v = p.get("printful");
    if (!v) return null;
    history.replaceState({}, "", location.pathname);
    if (v === "conectado") return "Printful conectado.";
    if (v === "rechazado") return "Cancelaste la conexion.";
    return `Printful fallo: ${p.get("msg") ?? "error"}`;
  });

  useEffect(() => {
    api.printfulStatus().then(setStatus).catch((e) => setError(String(e.message ?? e)));
  }, [api]);

  useEffect(() => {
    if (!status?.connected) return;
    let cancel = false;
    (async () => {
      try {
        const [cs, all] = await Promise.all([
          api.categories().then((r) => r.data).catch(() => []),
          api.fullCatalog((loaded, total) => !cancel && setProgreso({ loaded, total })),
        ]);
        if (cancel) return;
        setCats(cs);
        setItems(all);
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancel = true; };
  }, [status?.connected, api]);

  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const raices = useMemo(() => cats.filter((c) => !c.parent_id), [cats]);
  const titulo = (id: number) => byId.get(id)?.title ?? `Cat. ${id}`;

  const filtrados = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    const out = items.filter((p) => {
      if (!verDescontinuados && p.is_discontinued) return false;
      if (catId && rootOf(p.main_category_id, byId) !== catId) return false;
      if (!needle) return true;
      return `${p.name} ${p.brand ?? ""} ${p.model ?? ""} ${p.type}`.toLowerCase().includes(needle);
    });
    out.sort((a, b) =>
      orden === "variantes"
        ? b.variant_count - a.variant_count
        : orden === "categoria"
          ? titulo(rootOf(a.main_category_id, byId)).localeCompare(titulo(rootOf(b.main_category_id, byId))) ||
            a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
    );
    return out;
  }, [items, q, catId, orden, verDescontinuados, byId]);

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

  if (error) {
    return (
      <div className="connect-card">
        <span className="eyebrow">Error</span>
        <h2 className="connect-title">No se pudo leer el catalogo</h2>
        <p className="hint">{error}</p>
        <a className="btn" href={api.connectUrl()} style={{ marginTop: 14, display: "inline-block" }}>
          Reconectar Printful
        </a>
      </div>
    );
  }

  if (!items) {
    return (
      <p className="hint">
        Cargando catalogo... {progreso.loaded}
        {progreso.total ? ` / ${progreso.total}` : ""}
      </p>
    );
  }

  return (
    <div className="catalogo">
      <div className="filtros">
        <input
          type="text"
          className="buscador"
          value={q}
          placeholder="Buscar por nombre, marca o modelo..."
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
          <option value="nombre">Nombre</option>
          <option value="variantes">Mas variantes</option>
          <option value="categoria">Categoria</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={verDescontinuados}
            onChange={(e) => setVerDescontinuados(e.target.checked)}
          />
          Ver descontinuados
        </label>
      </div>

      <div className="chips">
        <button data-on={catId === null} onClick={() => setCatId(null)}>
          Todo ({items.filter((p) => verDescontinuados || !p.is_discontinued).length})
        </button>
        {raices.map((c) => {
          const n = items.filter(
            (p) =>
              (verDescontinuados || !p.is_discontinued) && rootOf(p.main_category_id, byId) === c.id,
          ).length;
          if (!n) return null;
          return (
            <button key={c.id} data-on={catId === c.id} onClick={() => setCatId(c.id)}>
              {c.title} ({n})
            </button>
          );
        })}
      </div>

      <p className="hint">
        {aviso ? `${aviso} ` : ""}
        {filtrados.length} de {items.length} productos.
      </p>

      <div className="cat-grid">
        {filtrados.slice(0, 60).map((p) => (
          <article className="cat-card" key={p.id}>
            <div className="cat-img">
              <img src={p.image} alt={p.name} />
            </div>
            <h3>{p.name}</h3>
            <p className="hint">
              {p.brand ?? titulo(rootOf(p.main_category_id, byId))} &middot; {p.variant_count} variantes
              {p.is_discontinued && " · descontinuado"}
            </p>
            <button className="btn wide" disabled title="Falta el cambio a wrapDegrees">
              Importar
            </button>
          </article>
        ))}
      </div>

      {filtrados.length > 60 && (
        <p className="hint">Mostrando 60. Afina la busqueda para ver el resto.</p>
      )}
      {filtrados.length === 0 && <p className="hint">Nada coincide con esa busqueda.</p>}
    </div>
  );
}
