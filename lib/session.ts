import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { COOKIE_SESSION, COOKIE_SUPER_ADMIN, verifierJetonSession, verifierJetonSuperAdmin } from "@/lib/auth";

export async function getCommercantConnecte() {
  const jeton = cookies().get(COOKIE_SESSION)?.value;
  if (!jeton) return null;

  const session = verifierJetonSession(jeton);
  if (!session) return null;

  return prisma.commercant.findUnique({ where: { id: session.commercantId } });
}

export function estSuperAdminConnecte(): boolean {
  const jeton = cookies().get(COOKIE_SUPER_ADMIN)?.value;
  if (!jeton) return false;
  return verifierJetonSuperAdmin(jeton);
}
