// توليد والتحقق من JWT باستخدام HMAC-SHA256 عبر Web Crypto فقط (بدون حزم خارجية)

function base64UrlEncode(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  input = input.replace(/-/g, "+").replace(/_/g, "/");
  while (input.length % 4) input += "=";
  return atob(input);
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(sig)));
}

export interface JwtPayload {
  sub: number; // user/admin id
  role: "customer" | "admin";
  exp: number; // انتهاء الصلاحية (unix seconds)
  [key: string]: unknown;
}

export async function signJWT(
  payload: Omit<JwtPayload, "exp">,
  secret: string,
  expiresInSeconds = 60 * 60 * 24 * 7 // أسبوع
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const fullPayload: JwtPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = await hmacSign(`${encodedHeader}.${encodedPayload}`, secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function verifyJWT(
  token: string,
  secret: string
): Promise<JwtPayload | null> {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !signature) return null;

    const expectedSig = await hmacSign(`${encodedHeader}.${encodedPayload}`, secret);
    if (expectedSig !== signature) return null;

    const payload: JwtPayload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null; // منتهي الصلاحية

    return payload;
  } catch {
    return null;
  }
}
