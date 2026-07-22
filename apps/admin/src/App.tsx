import { useEffect, useState } from "react";
import { api } from "./api";
import { Login } from "./Login";
import { Products } from "./Products";
import { Composer } from "./Composer";

type View = { name: "products" } | { name: "composer"; productId: string };

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [view, setView] = useState<View>({ name: "products" });

  useEffect(() => {
    api.authed().then(setAuthed).catch(() => setAuthed(false));
  }, []);

  if (authed === null) return <div className="boot">…</div>;
  if (!authed) return <Login onIn={() => setAuthed(true)} />;

  return (
    <div className="admin">
      <header className="topbar">
        <div className="brand">Abbiss</div>
        <nav className="tabs">
          <button data-on={view.name === "products"} onClick={() => setView({ name: "products" })}>Products</button>
          {view.name === "composer" && <button data-on onClick={() => {}}>Composer</button>}
        </nav>
        <div className="spacer" />
        <button className="btn" onClick={() => api.logout().then(() => setAuthed(false))}>Log out</button>
      </header>

      {view.name === "products" ? (
        <Products onEdit={(productId) => setView({ name: "composer", productId })} />
      ) : (
        <Composer productId={view.productId} onBack={() => setView({ name: "products" })} />
      )}
    </div>
  );
}
