import { Hono } from "hono";
import { Env } from "../types";
import { requireAdmin } from "../middleware/auth";
import { slugify, sanitizeText } from "../lib/validate";

const products = new Hono<{ Bindings: Env }>();

// ============ عام: قائمة المنتجات (بحث + فلترة + ترتيب + ترقيم صفحات) ============
products.get("/", async (c) => {
  const q = c.req.query();
  const page = Math.max(1, parseInt(q.page || "1"));
  const perPage = Math.min(50, Math.max(1, parseInt(q.per_page || "20")));
  const offset = (page - 1) * perPage;

  const conditions: string[] = ["p.status = 'active'"];
  const params: unknown[] = [];

  if (q.search) {
    conditions.push("(p.name LIKE ? OR p.description LIKE ?)");
    params.push(`%${q.search}%`, `%${q.search}%`);
  }
  if (q.category) {
    conditions.push("c.slug = ?");
    params.push(q.category);
  }
  if (q.type) {
    conditions.push("p.product_type = ?");
    params.push(q.type);
  }
  if (q.min_price) {
    conditions.push("p.price >= ?");
    params.push(Number(q.min_price));
  }
  if (q.max_price) {
    conditions.push("p.price <= ?");
    params.push(Number(q.max_price));
  }

  const sortMap: Record<string, string> = {
    newest: "p.created_at DESC",
    price_asc: "p.price ASC",
    price_desc: "p.price DESC",
    best_selling: "p.sales_count DESC",
  };
  const orderBy = sortMap[q.sort || "newest"] || sortMap.newest;

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM products p LEFT JOIN categories c ON p.category_id = c.id ${whereClause}`
  )
    .bind(...params)
    .first<{ total: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.slug, p.short_description, p.price, p.compare_price,
            p.discount_percent, p.stock_quantity, p.product_type, p.category_id,
            (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     ${whereClause}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`
  )
    .bind(...params, perPage, offset)
    .all();

  return c.json({
    success: true,
    data: results,
    pagination: {
      page,
      per_page: perPage,
      total: countRow?.total || 0,
      total_pages: Math.ceil((countRow?.total || 0) / perPage),
    },
  });
});

// ============ عام: منتج واحد بالتفصيل ============
products.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const product = await c.env.DB.prepare(
    "SELECT * FROM products WHERE slug = ? AND status = 'active'"
  )
    .bind(slug)
    .first<Record<string, unknown>>();

  if (!product) return c.json({ success: false, error: "المنتج غير موجود" }, 404);

  // لا نعرض digital_file_key أبدًا للعميل
  delete (product as Record<string, unknown>).digital_file_key;

  const images = await c.env.DB.prepare(
    "SELECT id, image_url, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order ASC"
  )
    .bind(product.id)
    .all();

  const related = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.slug, p.price, p.compare_price,
            (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
     FROM related_products rp
     JOIN products p ON p.id = rp.related_product_id
     WHERE rp.product_id = ? AND p.status = 'active'
     LIMIT 8`
  )
    .bind(product.id)
    .all();

  // زيادة عداد المشاهدات (غير حرج، لا داعي لانتظاره)
  c.executionCtx.waitUntil(
    c.env.DB.prepare("UPDATE products SET views_count = views_count + 1 WHERE id = ?")
      .bind(product.id)
      .run()
  );

  return c.json({
    success: true,
    data: { ...product, images: images.results, related_products: related.results },
  });
});

// ============ أدمن: إنشاء منتج ============
products.post("/", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.name || body.price === undefined) {
    return c.json({ success: false, error: "اسم المنتج والسعر مطلوبان" }, 400);
  }

  const name = sanitizeText(body.name, 200);
  const slug = body.slug ? slugify(body.slug) : slugify(name);
  const price = Number(body.price);

  if (isNaN(price) || price < 0) {
    return c.json({ success: false, error: "السعر غير صالح" }, 400);
  }

  const exists = await c.env.DB.prepare("SELECT id FROM products WHERE slug = ?")
    .bind(slug)
    .first();
  if (exists) return c.json({ success: false, error: "الرابط (slug) مستخدم بالفعل" }, 409);

  const result = await c.env.DB.prepare(
    `INSERT INTO products
     (name, slug, description, short_description, price, compare_price, discount_percent,
      sku, stock_quantity, category_id, product_type, digital_file_key, status,
      meta_title, meta_description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      name,
      slug,
      sanitizeText(body.description || "", 5000) || null,
      sanitizeText(body.short_description || "", 500) || null,
      price,
      body.compare_price ? Number(body.compare_price) : null,
      body.discount_percent ? Number(body.discount_percent) : 0,
      body.sku || null,
      body.stock_quantity !== undefined ? Number(body.stock_quantity) : 0,
      body.category_id || null,
      body.product_type === "digital" ? "digital" : "physical",
      body.digital_file_key || null,
      body.status || "active",
      sanitizeText(body.meta_title || "", 200) || null,
      sanitizeText(body.meta_description || "", 300) || null
    )
    .run();

  const productId = result.meta.last_row_id;

  // إضافة الصور إن وُجدت
  if (Array.isArray(body.images)) {
    for (let i = 0; i < body.images.length; i++) {
      const img = body.images[i];
      await c.env.DB.prepare(
        "INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)"
      )
        .bind(productId, img.url, i === 0 ? 1 : 0, i)
        .run();
    }
  }

  return c.json({ success: true, data: { id: productId, name, slug } });
});

// ============ أدمن: تعديل منتج ============
products.put("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ success: false, error: "بيانات غير صالحة" }, 400);

  await c.env.DB.prepare(
    `UPDATE products SET
      name = ?, description = ?, short_description = ?, price = ?, compare_price = ?,
      discount_percent = ?, sku = ?, stock_quantity = ?, category_id = ?, product_type = ?,
      digital_file_key = ?, status = ?, meta_title = ?, meta_description = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      sanitizeText(body.name || "", 200),
      sanitizeText(body.description || "", 5000) || null,
      sanitizeText(body.short_description || "", 500) || null,
      Number(body.price) || 0,
      body.compare_price ? Number(body.compare_price) : null,
      body.discount_percent ? Number(body.discount_percent) : 0,
      body.sku || null,
      body.stock_quantity !== undefined ? Number(body.stock_quantity) : 0,
      body.category_id || null,
      body.product_type === "digital" ? "digital" : "physical",
      body.digital_file_key || null,
      body.status || "active",
      sanitizeText(body.meta_title || "", 200) || null,
      sanitizeText(body.meta_description || "", 300) || null,
      id
    )
    .run();

  return c.json({ success: true, data: { message: "تم التحديث" } });
});

// ============ أدمن: حذف منتج ============
products.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  return c.json({ success: true, data: { message: "تم الحذف" } });
});

export default products;
