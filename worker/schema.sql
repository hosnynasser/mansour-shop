-- MANSOUR POS — قاعدة بيانات D1 (mansour-pos)
CREATE TABLE IF NOT EXISTS stock (
    code TEXT PRIMARY KEY,
    qty INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    num TEXT UNIQUE,
    ts TEXT,
    day TEXT,
    staff TEXT,
    payment TEXT,
    subtotal REAL,
    discount REAL,
    total REAL,
    status TEXT DEFAULT 'completed',
    customer_name TEXT DEFAULT '',
    customer_phone TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS invoice_items (
    invoice_id INTEGER,
    code TEXT,
    name TEXT,
    price REAL,
    qty INTEGER,
    discount REAL DEFAULT 0,
    line_total REAL
);
CREATE INDEX IF NOT EXISTS idx_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_ts ON invoices(ts);
CREATE INDEX IF NOT EXISTS idx_invoices_day ON invoices(day);
