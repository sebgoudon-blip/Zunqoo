import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-non-securise";

export { COOKIE_SESSION, COOKIE_SUPER_ADMIN } from "@/lib/auth-constants";

export async function hashMotDePasse(motDePasse: string): Promise<string> {
  return bcrypt.hash(motDePasse, 10);
}

export async function verifierMotDePasse(
  motDePasse: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(motDePasse, hash);
}

type SessionCommercant = { commercantId: string };

export function creerJetonSession(commercantId: string): string {
  const payload: SessionCommercant = { commercantId };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifierJetonSession(jeton: string): SessionCommercant | null {
  try {
    return jwt.verify(jeton, JWT_SECRET) as SessionCommercant;
  } catch {
    return null;
  }
}

export function creerJetonSuperAdmin(): string {
  return jwt.sign({ role: "super_admin" }, JWT_SECRET, { expiresIn: "12h" });
}

export function verifierJetonSuperAdmin(jeton: string): boolean {
  try {
    const decoded = jwt.verify(jeton, JWT_SECRET) as { role?: string };
    return decoded.role === "super_admin";
  } catch {
    return false;
  }
}
