import { Hono } from "hono";
import { Env } from "../types";
import { hashPassword, verifyPassword } from "../lib/password";
import { signJWT, verifyJWT } from "../lib/jwt";
import { isValidEmail, isStrongPassword, sanitizeText } from "../lib/validate";
import { rateLimit } from "../middleware/auth";

const auth = new Hono<{ Bindings: Env }>();

// ============ إنشاء حساب عميل جديد ============
auth.post("/register", rateLimit(10, 60_000), async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ success: false, error: "بيانات غير صالحة" }, 400);

  const full_name = sanitizeText(body.full_name || "", 100);
  const email = (body.email || "").toString().trim().toLowerCase();
  const phone = sanitizeText(body.phone || "", 20);
  const password = (body.password || "").toString();

  if (!full_name || full_name.length < 2) {
    return c.json({ success: false, error: "الاسم مطلوب" }, 400);
  }
  if (!isValidEmail(email)) {
    return c.json({ success: false, error: "البريد الإلكتروني غير صالح" }, 400);
  }
  if (!isStrongPassword(password)) {
    return c.json(
      { success: false, error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي على حرف ورقم" },
      400
    );
  }

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();
  if (existing) {
    return c.json({ success: false, error: "البريد الإلكتروني مستخدم بالفعل" }, 409);
  }

  const { hash, salt } = await hashPassword(password);

  const result = await c.env.DB.prepare(
    `INSERT INTO users (full_name, email, phone, password_hash, password_salt)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(full_name, email, phone || null, hash, salt)
    .run();

  const userId = result.meta.last_row_id;
  const token = await signJWT({ sub: userId as number, role: "customer" }, c.env.JWT_SECRET);

  return c.json({
    success: true,
    data: { token, user: { id: userId, full_name, email, phone } },
  });
});

// ============ تسجيل الدخول (عميل) ============
auth.post("/login", rateLimit(8, 60_000), async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ success: false, error: "بيانات غير صالحة" }, 400);

  const email = (body.email || "").toString().trim().toLowerCase();
  const password = (body.password || "").toString();

  const user = await c.env.DB.prepare(
    "SELECT id, full_name, email, phone, password_hash, password_salt, is_active FROM users WHERE email = ?"
  )
    .bind(email)
    .first<{
      id: number;
      full_name: string;
      email: string;
      phone: string | null;
      password_hash: string;
      password_salt: string;
      is_active: number;
    }>();

  // رسالة خطأ موحدة لتفادي كشف وجود الحساب من عدمه
  const genericError = { success: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };

  if (!user || !user.is_active) return c.json(genericError, 401);

  const valid = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valid) return c.json(genericError, 401);

  const token = await signJWT({ sub: user.id, role: "customer" }, c.env.JWT_SECRET);

  return c.json({
    success: true,
    data: {
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, phone: user.phone },
    },
  });
});

// ============ تسجيل دخول الأدمن ============
auth.post("/admin/login", rateLimit(8, 60_000), async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ success: false, error: "بيانات غير صالحة" }, 400);

  const email = (body.email || "").toString().trim().toLowerCase();
  const password = (body.password || "").toString();

  const admin = await c.env.DB.prepare(
    "SELECT id, full_name, email, password_hash, password_salt, role, is_active FROM admins WHERE email = ?"
  )
    .bind(email)
    .first<{
      id: number;
      full_name: string;
      email: string;
      password_hash: string;
      password_salt: string;
      role: string;
      is_active: number;
    }>();

  const genericError = { success: false, error: "بيانات الدخول غير صحيحة" };
  if (!admin || !admin.is_active) return c.json(genericError, 401);

  const valid = await verifyPassword(password, admin.password_hash, admin.password_salt);
  if (!valid) return c.json(genericError, 401);

  const token = await signJWT(
    { sub: admin.id, role: "admin", adminRole: admin.role },
    c.env.JWT_SECRET,
    60 * 60 * 12 // 12 ساعة لجلسة الأدمن
  );

  return c.json({
    success: true,
    data: { token, admin: { id: admin.id, full_name: admin.full_name, email: admin.email, role: admin.role } },
  });
});

// ============ الملف الشخصي الحالي ============
auth.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ success: false, error: "غير مصرح" }, 401);
  }
  const payload = await verifyJWT(authHeader.slice(7), c.env.JWT_SECRET);
  if (!payload) return c.json({ success: false, error: "الجلسة غير صالحة" }, 401);

  if (payload.role === "customer") {
    const user = await c.env.DB.prepare(
      "SELECT id, full_name, email, phone, created_at FROM users WHERE id = ?"
    )
      .bind(payload.sub)
      .first();
    return c.json({ success: true, data: user });
  }

  const admin = await c.env.DB.prepare(
    "SELECT id, full_name, email, role FROM admins WHERE id = ?"
  )
    .bind(payload.sub)
    .first();
  return c.json({ success: true, data: admin });
});

// ============ تغيير كلمة المرور (للعميل المسجل دخوله) ============
auth.post("/change-password", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ success: false, error: "غير مصرح" }, 401);
  }
  const payload = await verifyJWT(authHeader.slice(7), c.env.JWT_SECRET);
  if (!payload || payload.role !== "customer") {
    return c.json({ success: false, error: "غير مصرح" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const currentPassword = (body?.current_password || "").toString();
  const newPassword = (body?.new_password || "").toString();

  if (!isStrongPassword(newPassword)) {
    return c.json(
      { success: false, error: "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل وتحتوي على حرف ورقم" },
      400
    );
  }

  const user = await c.env.DB.prepare(
    "SELECT password_hash, password_salt FROM users WHERE id = ?"
  )
    .bind(payload.sub)
    .first<{ password_hash: string; password_salt: string }>();

  if (!user) return c.json({ success: false, error: "المستخدم غير موجود" }, 404);

  const valid = await verifyPassword(currentPassword, user.password_hash, user.password_salt);
  if (!valid) return c.json({ success: false, error: "كلمة المرور الحالية غير صحيحة" }, 401);

  const { hash, salt } = await hashPassword(newPassword);
  await c.env.DB.prepare(
    "UPDATE users SET password_hash = ?, password_salt = ?, updated_at = datetime('now') WHERE id = ?"
  )
    .bind(hash, salt, payload.sub)
    .run();

  return c.json({ success: true, data: { message: "تم تغيير كلمة المرور بنجاح" } });
});

export default auth;
