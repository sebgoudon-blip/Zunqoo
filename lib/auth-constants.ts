// Constantes partagees avec le middleware (edge runtime), separees de lib/auth.ts
// qui utilise bcryptjs/jsonwebtoken (non compatibles edge runtime).
export const COOKIE_SESSION = "af_session";
export const COOKIE_SUPER_ADMIN = "af_super_admin";
