-- إعدادات افتراضية للمتجر
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('store_name', 'متجري'),
  ('store_description', 'متجر إلكتروني عربي احترافي'),
  ('store_logo_url', ''),
  ('store_phone', ''),
  ('whatsapp_number', ''),
  ('store_email', ''),
  ('store_address', ''),
  ('currency', 'YER'),
  ('country', 'YE'),
  ('primary_color', '#0f766e'),
  ('theme_mode', 'light'),
  ('shipping_flat_rate', '0'),
  ('return_policy', ''),
  ('terms_of_use', ''),
  ('privacy_policy', '');

-- طريقتا دفع افتراضيتان (يمكن تعديلهما من لوحة التحكم لاحقًا)
INSERT OR IGNORE INTO payment_methods (id, method_type, display_name, fields_json, instructions, is_active, sort_order)
VALUES
  (1, 'bank_transfer', 'تحويل بنكي',
   '{"bank_name":"اسم البنك","account_holder":"اسم صاحب الحساب","account_number":"رقم الحساب","iban":""}',
   'يرجى تحويل المبلغ إلى الحساب البنكي ثم رفع إثبات التحويل.', 1, 1),
  (2, 'e_wallet', 'محفظة إلكترونية',
   '{"wallet_name":"اسم المحفظة","wallet_number":"رقم المحفظة","account_holder":"اسم صاحب الحساب"}',
   'يرجى التحويل إلى المحفظة الإلكترونية ثم رفع إثبات التحويل.', 1, 2);

-- ملاحظة: أنشئ حساب الأدمن الأول عبر سكربت create-admin.ts (أكثر أمانًا من كتابة كلمة مرور هنا)
