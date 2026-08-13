import { Hono } from "hono";
import { cors } from "hono/cors";
import { Env } from "./types";

import authRoutes from "./routes/auth";
import categoriesRoutes from "./routes/categories";
import productsRoutes from "./routes/products";
import settingsRoutes from "./routes/settings";

const app = new Hono<{ Bindings: Env }>();

// ============ CORS ============
// عدّل origin لاحقًا إلى نطاق متجرك الفعلي بدل "*" لحماية أفضل
app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// ============ رؤوس أمان أساسية (XSS / Clickjacking / MIME sniffing) ============
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

// ============ فحص الحالة ============
app.get("/api/health", (c) =>
  c.json({ success: true, data: { status: "ok", time: new Date().toISOString() } })
);

// ============ المسارات ============
app.route("/api/auth", authRoutes);
app.route("/api/categories", categoriesRoutes);
app.route("/api/products", productsRoutes);
app.route("/api/settings", settingsRoutes);

// ============ 404 ============
app.notFound((c) => c.json({ success: false, error: "المسار غير موجود" }, 404));

// ============ معالجة الأخطاء العامة (لا تُسرّب أسرار النظام) ============
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ success: false, error: "حدث خطأ في الخادم، حاول لاحقًا" }, 500);
});

export default app;
