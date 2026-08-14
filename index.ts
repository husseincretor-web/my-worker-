import { Hono } from "hono";
import { cors } from "hono/cors";
import { Env } from "./types";

import authData from "./auth";
import categoriesData from "./categories";
import productsData from "./products";
import settingsData from "./settings";

const app = new Hono<{ Bindings: Env }>();

// ============ CORS ============
app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// ============ رؤوس أمان أساسية ============
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
app.route("/api/auth", authData);
app.route("/api/categories", categoriesData);
app.route("/api/products", productsData);
app.route("/api/settings", settingsData);

// ============ 404 ============
app.notFound((c) => c.json({ success: false, error: "المسار غير موجود" }, 404));

// ============ معالجة الأخطاء ============
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ success: false, error: "حدث خطأ في الخادم، حاول لاحقًا" }, 500);
});

export default app;
