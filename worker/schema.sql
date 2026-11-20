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
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    balance REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    num TEXT UNIQUE,
    ts TEXT,
    day TEXT,
    staff TEXT,
    supplier_id INTEGER DEFAULT 0,
    supplier_name TEXT DEFAULT '',
    total REAL,
    paid REAL DEFAULT 0,
    status TEXT DEFAULT 'completed',
    note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS purchase_items (
    purchase_id INTEGER,
    code TEXT,
    name TEXT,
    qty INTEGER,
    cost REAL
);
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT,
    day TEXT,
    title TEXT,
    amount REAL,
    cat TEXT DEFAULT 'عام',
    staff TEXT,
    note TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_expenses_day ON expenses(day);

-- stage 4 batch 2
ALTER TABLE invoice_items ADD COLUMN cost REAL DEFAULT 0;
CREATE TABLE IF NOT EXISTS supplier_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT, day TEXT, supplier_id INTEGER, amount REAL, staff TEXT, note TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_suppay_day ON supplier_payments(day);
CREATE TABLE IF NOT EXISTS cheques (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT, day TEXT,
    kind TEXT NOT NULL,           -- in = وارد من عميل / out = صادر لمورد
    party TEXT,
    customer_id INTEGER DEFAULT 0,
    supplier_id INTEGER DEFAULT 0,
    number TEXT DEFAULT '',
    bank TEXT DEFAULT '',
    amount REAL NOT NULL,
    due_day TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending / cleared / bounced
    done_day TEXT DEFAULT '',
    note TEXT DEFAULT '',
    staff TEXT
);
CREATE INDEX IF NOT EXISTS idx_cheques_due ON cheques(due_day);

-- stage 4 batch 3
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS points_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, ts TEXT, day TEXT,
    delta INTEGER NOT NULL, kind TEXT, invoice_id INTEGER, note TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_points_customer ON points_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_points_invoice ON points_log(invoice_id);
CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, day TEXT, check_in TEXT, check_out TEXT DEFAULT '', manual INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_att_day ON attendance(day);
CREATE TABLE IF NOT EXISTS pay_rates (user TEXT PRIMARY KEY, kind TEXT DEFAULT 'month', rate REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS pay_advances (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, day TEXT, user TEXT, amount REAL, note TEXT DEFAULT '', staff TEXT);
CREATE TABLE IF NOT EXISTS pay_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, day TEXT, user TEXT, month TEXT, amount REAL, staff TEXT);
