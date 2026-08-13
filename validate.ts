export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isStrongPassword(password: string): boolean {
  // 8 أحرف على الأقل، تحتوي حرف ورقم
  return password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

export function slugify(text: string): string {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\u0600-\u06FF\w-]+/g, "") // يسمح بالعربية والإنجليزية
    .replace(/-+/g, "-");
}

export function sanitizeText(text: string, maxLen = 5000): string {
  return text.toString().trim().slice(0, maxLen);
}
