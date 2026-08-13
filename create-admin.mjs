// سكربت لإنشاء حساب الأدمن الأول بأمان.
// الاستخدام:
//   node scripts/create-admin.mjs "الاسم الكامل" admin@example.com "كلمة-مرور-قوية123"
// سيطبع أمر SQL جاهزًا، نفّذه بواسطة:
//   npx wrangler d1 execute arabic-store-db --remote --command "...الأمر الناتج..."

import { pbkdf2Sync, randomBytes } from "node:crypto";

const [, , fullName, email, password] = process.argv;

if (!fullName || !email || !password) {
  console.error('الاستخدام: node scripts/create-admin.mjs "الاسم" email@example.com "كلمة المرور"');
  process.exit(1);
}

if (password.length < 8) {
  console.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 100000, 32, "sha256");

const hashHex = hash.toString("hex");
const saltHex = salt.toString("hex");

const escapedName = fullName.replace(/'/g, "''");
const escapedEmail = email.trim().toLowerCase().replace(/'/g, "''");

const sql = `INSERT INTO admins (full_name, email, password_hash, password_salt, role) VALUES ('${escapedName}', '${escapedEmail}', '${hashHex}', '${saltHex}', 'super_admin');`;

console.log("\nنفّذ هذا الأمر لإنشاء الأدمن على القاعدة الفعلية:\n");
console.log(`npx wrangler d1 execute arabic-store-db --remote --command "${sql}"\n`);
console.log("أو محليًا للتجربة:\n");
console.log(`npx wrangler d1 execute arabic-store-db --local --command "${sql}"\n`);
