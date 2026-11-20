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
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT
);
CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    ts TEXT,
    day TEXT,
    kind TEXT NOT NULL,
    amount REAL NOT NULL,
    invoice_id INTEGER,
    staff TEXT,
    note TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_ledger_day ON ledger(day);
CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    num TEXT UNIQUE,
    ts TEXT,
    day TEXT,
    staff TEXT,
    customer_name TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    subtotal REAL,
    discount REAL DEFAULT 0,
    total REAL,
    status TEXT DEFAULT 'open',
    invoice_id INTEGER
);
CREATE TABLE IF NOT EXISTS quote_items (
    quote_id INTEGER,
    code TEXT,
    name TEXT,
    price REAL,
    qty INTEGER,
    discount REAL DEFAULT 0,
    line_total REAL
);
CREATE INDEX IF NOT EXISTS idx_qitems_quote ON quote_items(quote_id);
