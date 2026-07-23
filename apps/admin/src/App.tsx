import { useEffect, useState } from "react";
import { api } from "./api";
import { Login } from "./Login";
import { Sidebar, type Dest } from "./Sidebar";
import { CreateProducts } from "./CreateProducts";
import { MyProducts } from "./MyProducts";
import { Studio } from "./Studio";

type View =
  | { name: "create" }
  | { name: "products" }
  | { name: "studio"; productId: string };

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [view, setView] = useState<View>({ name: "create" });

  useEffect(() => {
    api.authed().then(setAuthed).catch(() => setAuthed(false));
  }, []);

  if (authed === null) return <div className="boot">…</div>;
  if (!authed) return <Login onIn={() => setAuthed(true)} />;

  const dest: Dest = view.name === "products" ? "products" : "create";
  const go = (d: Dest) => setView(d === "products" ? { name: "products" } : { name: "create" });

  return (
    <div className="admin-shell">
      <Sidebar dest={dest} onNavigate={go} onLogout={() => api.logout().then(() => setAuthed(false))} />
      <div className="admin-main">
        {view.name === "studio" ? (
          <Studio productId={view.productId} onBack={() => setView({ name: "create" })} />
        ) : view.name === "products" ? (
          <MyProducts onDesign={(productId) => setView({ name: "studio", productId })} />
        ) : (
          <CreateProducts onEdit={(productId) => setView({ name: "studio", productId })} />
        )}
      </div>
    </div>
  );
}
