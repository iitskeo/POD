import { Icon } from "@abbiss/preview-engine";

export type Dest = "create" | "products";

const STOREFRONT = import.meta.env.VITE_STOREFRONT_BASE ?? "http://localhost:5173";

/** Persistent left nav (spec 07 §1): My Store · Create Products · My Products. */
export function Sidebar({ dest, onNavigate, onLogout }: {
  dest: Dest; onNavigate: (d: Dest) => void; onLogout: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">Abbiss</div>
      <nav className="side-nav">
        <a className="side-link" href={STOREFRONT} target="_blank" rel="noreferrer">
          <span className="si"><Icon name="external-link" size={17} /></span> My Store
        </a>
        <button className="side-link" data-on={dest === "create"} onClick={() => onNavigate("create")}>
          <span className="si"><Icon name="pen" size={17} /></span> Create Products
        </button>
        <button className="side-link" data-on={dest === "products"} onClick={() => onNavigate("products")}>
          <span className="si"><Icon name="grid" size={17} /></span> My Products
        </button>
      </nav>
      <div className="spacer" />
      <button className="side-link muted" onClick={onLogout}><span className="si"><Icon name="log-out" size={16} /></span> Log out</button>
    </aside>
  );
}
