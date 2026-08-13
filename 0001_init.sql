-- ============================================================
-- قاعدة بيانات المتجر الإلكتروني - Cloudflare D1 (SQLite)
-- ============================================================

PRAGMA foreign_keys = ON;

-- ================= المستخدمون (العملاء) =================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  reset_token TEXT,
  reset_token_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ================= المدراء (الأدمن) =================
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', -- super_admin | admin | editor
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);

-- ================= التصنيفات =================
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  parent_id INTEGER,
  image_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- ================= المنتجات =================
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  short_description TEXT,
  price REAL NOT NULL,
  compare_price REAL, -- السعر قبل الخصم
  discount_percent REAL DEFAULT 0,
  sku TEXT UNIQUE,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER,
  product_type TEXT NOT NULL DEFAULT 'physical', -- physical | digital
  digital_file_key TEXT, -- مفتاح الملف في R2 (لا يُعرض للعميل مباشرة)
  status TEXT NOT NULL DEFAULT 'active', -- active | inactive | out_of_stock
  meta_title TEXT,
  meta_description TEXT,
  views_count INTEGER NOT NULL DEFAULT 0,
  sales_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(product_type);

-- ================= صور المنتجات =================
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

-- ================= المنتجات ذات الصلة =================
CREATE TABLE IF NOT EXISTS related_products (
  product_id INTEGER NOT NULL,
  related_product_id INTEGER NOT NULL,
  PRIMARY KEY (product_id, related_product_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (related_product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- ================= الخدمات =================
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  price REAL NOT NULL,
  duration_text TEXT, -- مثال: "3 أيام عمل"
  status TEXT NOT NULL DEFAULT 'active', -- active | inactive
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);

-- ================= الحجوزات/الاستشارات =================
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_number TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  consultation_type TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  appointment_date TEXT NOT NULL,
  appointment_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | rejected | rescheduled | completed | cancelled
  payment_status TEXT NOT NULL DEFAULT 'pending', -- pending | review | paid | rejected
  price REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);

-- ================= طرق الدفع (قابلة للإضافة من لوحة التحكم) =================
CREATE TABLE IF NOT EXISTS payment_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method_type TEXT NOT NULL, -- bank_transfer | e_wallet | (future: card_gateway)
  display_name TEXT NOT NULL, -- "تحويل بنكي" / "محفظة إلكترونية"
  fields_json TEXT NOT NULL, -- JSON: {"bank_name":"...","account_number":"...","account_holder":"...","iban":"..."}
  instructions TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ================= الطلبات =================
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  customer_address TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  shipping_cost REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'YER',
  coupon_code TEXT,
  payment_method_id INTEGER,
  payment_status TEXT NOT NULL DEFAULT 'pending', -- pending | review | paid | rejected | cancelled
  order_status TEXT NOT NULL DEFAULT 'new', -- new | processing | completed | cancelled | refunded
  admin_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_order_status ON orders(order_status);

-- ================= عناصر الطلب =================
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER,
  service_id INTEGER,
  item_name TEXT NOT NULL, -- نسخة عن الاسم وقت الشراء
  unit_price REAL NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  line_total REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ================= المدفوعات =================
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  appointment_id INTEGER,
  amount REAL NOT NULL,
  payment_method_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | review | paid | rejected
  reviewed_by_admin_id INTEGER,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

-- ================= إثباتات الدفع (خاصة - غير عامة) =================
CREATE TABLE IF NOT EXISTS payment_proofs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL,
  file_key TEXT NOT NULL, -- مفتاح الصورة داخل R2 (خاص، ليس رابطًا عامًا)
  transaction_number TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review', -- pending_review | accepted | rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_payment ON payment_proofs(payment_id);

-- ================= تحميلات المنتجات الرقمية (روابط مؤقتة) =================
CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_item_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  download_token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_downloads_token ON downloads(download_token);
CREATE INDEX IF NOT EXISTS idx_downloads_user ON downloads(user_id);

-- ================= الكوبونات =================
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL DEFAULT 'percent', -- percent | fixed
  discount_value REAL NOT NULL,
  min_order_amount REAL DEFAULT 0,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  expires_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

-- ================= التقييمات =================
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  service_id INTEGER,
  user_id INTEGER,
  customer_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  is_approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

-- ================= إعدادات المتجر (key-value) =================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
