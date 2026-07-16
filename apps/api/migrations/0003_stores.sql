-- Conexion OAuth a una tienda de Printful.
--
-- El token vive aqui y nunca en el codigo ni en el navegador: es la razon de ser
-- del Worker. La tabla lleva store_id desde el principio para que multi-tenant sea
-- una decision futura y no una migracion dolorosa, pero hoy solo hay una fila.
CREATE TABLE IF NOT EXISTS stores (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL DEFAULT 'printful',
  external_id   TEXT,
  name          TEXT,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Estado del handshake OAuth. Se verifica y se borra al volver: sin esto, el
-- callback acepta cualquier code que le manden (CSRF).
CREATE TABLE IF NOT EXISTS oauth_states (
  state      TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- Un producto pertenece a la tienda desde la que se importo.
ALTER TABLE products ADD COLUMN store_id TEXT;
