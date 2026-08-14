import { Hono } from "hono";
import { Env } from "../types";
import { requireAdmin } from "../middleware/auth";

const settings = new Hono<{ Bindings: Env }>();

// ============ عام: كل الإعدادات (تستخدمها الواجهة الأمامية) ============
settings.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT key, value FROM settings").all<{
    key: string;
    value: string;
  }>();
  const map: Record<string, string> = {};
  for (const row of results) map[row.key] = row.value;
  return c.json({ success: true, data: map });
});

// ============ أدمن: تحديث إعدادات (مجموعة key/value) ============
settings.put("/", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ success: false, error: "بيانات غير صالحة" }, 400);
  }

  const entries = Object.entries(body as Record<string, string>);
  const statements = entries.map(([key, value]) =>
    c.env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    ).bind(key, String(value))
  );

  if (statements.length) await c.env.DB.batch(statements);

  return c.json({ success: true, data: { message: "تم تحديث الإعدادات" } });
});

export default settings;
