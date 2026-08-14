import { Hono } from "hono";
import { Env } from "../types";
import { requireAdmin } from "../middleware/auth";
import { slugify, sanitizeText } from "../lib/validate";

const categories = new Hono<{ Bindings: Env }>();

// ============ عام: عرض كل التصنيفات النشطة ============
categories.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, slug, description, parent_id, image_url, sort_order FROM categories WHERE is_active = 1 ORDER BY sort_order ASC"
  ).all();
  return c.json({ success: true, data: results });
});

// ============ عام: تصنيف واحد عبر slug ============
categories.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const category = await c.env.DB.prepare(
    "SELECT * FROM categories WHERE slug = ? AND is_active = 1"
  )
    .bind(slug)
    .first();
  if (!category) return c.json({ success: false, error: "التصنيف غير موجود" }, 404);
  return c.json({ success: true, data: category });
});

// ============ أدمن: إنشاء تصنيف ============
categories.post("/", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.name) return c.json({ success: false, error: "اسم التصنيف مطلوب" }, 400);

  const name = sanitizeText(body.name, 100);
  const slug = body.slug ? slugify(body.slug) : slugify(name);
  const description = sanitizeText(body.description || "", 1000);

  const exists = await c.env.DB.prepare("SELECT id FROM categories WHERE slug = ?")
    .bind(slug)
    .first();
  if (exists) return c.json({ success: false, error: "الرابط (slug) مستخدم بالفعل" }, 409);

  const result = await c.env.DB.prepare(
    `INSERT INTO categories (name, slug, description, parent_id, image_url, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      name,
      slug,
      description || null,
      body.parent_id || null,
      body.image_url || null,
      body.sort_order || 0
    )
    .run();

  return c.json({ success: true, data: { id: result.meta.last_row_id, name, slug } });
});

// ============ أدمن: تعديل تصنيف ============
categories.put("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ success: false, error: "بيانات غير صالحة" }, 400);

  await c.env.DB.prepare(
    `UPDATE categories SET name = ?, description = ?, parent_id = ?, image_url = ?,
     is_active = ?, sort_order = ? WHERE id = ?`
  )
    .bind(
      sanitizeText(body.name || "", 100),
      sanitizeText(body.description || "", 1000) || null,
      body.parent_id || null,
      body.image_url || null,
      body.is_active === undefined ? 1 : Number(body.is_active),
      body.sort_order || 0,
      id
    )
    .run();

  return c.json({ success: true, data: { message: "تم التحديث" } });
});

// ============ أدمن: حذف تصنيف ============
categories.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
  return c.json({ success: true, data: { message: "تم الحذف" } });
});

export default categories;
