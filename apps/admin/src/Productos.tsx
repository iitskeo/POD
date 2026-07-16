import {
  minPrice,
  type ApiClient,
  type CatalogProduct,
  type Category,
  type PrintfulStatus,
} from "@abbiss/preview-engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Detalle } from "./Detalle";

interface Props {
  api: ApiClient;
}

const VISIBLES = 48;

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
  const [abierto, setAbierto] = useState<CatalogProduct | null>(null);

  // El precio no viene en el listado: se pide por producto y se cachea.
  const [precios, setPrecios] = useState<Map<number, number | null>>(new Map());
  const pidiendo = useRef(new Set<number>());

  const [aviso] = useState<string | null>(() => {
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
        // Los descontinuados no se pueden vender: no llegan ni a la lista.
        setItems(all.filter((p) => !p.is_discontinued));
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
    return items
      .filter((p) => {
        if (catId && rootOf(p.main_category_id, byId) !== catId) return false;
        if (!needle) return true;
        return `${p.name} ${p.brand ?? ""} ${p.model ?? ""} ${p.type}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, q, catId, byId]);

  const enPantalla = useMemo(() => filtrados.slice(0, VISIBLES), [filtrados]);

  /**
   * Pide precios solo de lo que esta en pantalla, de a pocos.
   *
   * Son 498 productos y una llamada por producto; pedirlos todos quemaria el rate
   * limit de Printful para no mostrar 490 precios que nadie mira.
   */
  const pedirPrecios = useCallback(
    async (lista: CatalogProduct[]) => {
      const faltan = lista.filter((p) => !precios.has(p.id) && !pidiendo.current.has(p.id));
      if (!faltan.length) return;
      faltan.forEach((p) => pidiendo.current.add(p.id));

      const POOL = 4;
      for (let i = 0; i < faltan.length; i += POOL) {
        const lote = faltan.slice(i, i + POOL);
        const res = await Promise.all(
          lote.map((p) =>
            api.productPrices(p.id)
              .then((r) => [p.id, minPrice(r.data)] as const)
              .catch(() => [p.id, null] as const),
          ),
        );
        setPrecios((prev) => {
          const next = new Map(prev);
          for (const [id, v] of res) next.set(id, v);
          return next;
        });
      }
    },
    [api, precios],
  );

  useEffect(() => {
    if (enPantalla.length) void pedirPrecios(enPantalla);
  }, [enPantalla, pedirPrecios]);

  // Buscar salta a "Todo": buscar "tumbler" dentro de Accessories no devuelve nada
  // y parece que el buscador esta roto.
  const buscar = (v: string) => {
    setQ(v);
    if (v.trim()) setCatId(null);
  };

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
      <input
        type="text"
        className="buscador"
        value={q}
        placeholder="Buscar por nombre, marca o modelo..."
        onChange={(e) => buscar(e.target.value)}
      />

      <div className="chips">
        <button data-on={catId === null} onClick={() => setCatId(null)}>
          Todo ({items.length})
        </button>
        {raices.map((c) => {
          const n = items.filter((p) => rootOf(p.main_category_id, byId) === c.id).length;
          if (!n) return null;
          return (
            <button key={c.id} data-on={catId === c.id} onClick={() => { setCatId(c.id); setQ(""); }}>
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
        {enPantalla.map((p) => {
          const precio = precios.get(p.id);
          return (
            <article className="cat-card" key={p.id}>
              <button className="cat-open" onClick={() => setAbierto(p)} title="Ver detalles">
                <div className="cat-img"><img src={p.image} alt={p.name} /></div>
                <h3>{p.name}</h3>
              </button>
              <p className="hint">
                {p.brand ?? titulo(rootOf(p.main_category_id, byId))} &middot; {p.variant_count} variantes
              </p>
              <p className="precio">
                {precio === undefined ? "..." : precio === null ? "sin precio" : `desde $${precio.toFixed(2)}`}
              </p>
              <div className="cat-actions">
                <button className="btn" onClick={() => setAbierto(p)}>Ver</button>
                <button className="btn" disabled title="Falta el cambio a wrapDegrees">
                  Importar
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {filtrados.length > VISIBLES && (
        <p className="hint">Mostrando {VISIBLES}. Afina la busqueda para ver el resto.</p>
      )}
      {filtrados.length === 0 && <p className="hint">Nada coincide con esa busqueda.</p>}

      {abierto && <Detalle api={api} product={abierto} onClose={() => setAbierto(null)} />}
    </div>
  );
}
