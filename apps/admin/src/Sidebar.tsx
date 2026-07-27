import { Icon } from "@abbiss/preview-engine";

export type Dest = "store" | "create" | "products";

/** Persistent left nav (spec 07 §1): My Store · Create Products · My Products. */
export function Sidebar({ dest, onNavigate, onLogout }: {
  dest: Dest; onNavigate: (d: Dest) => void; onLogout: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">Abbiss</div>
      <nav className="side-nav">
        <button className="side-link" data-on={dest === "store"} onClick={() => onNavigate("store")}>
          <span className="si"><Icon name="square" size={17} /></span> My Store
        </button>
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
