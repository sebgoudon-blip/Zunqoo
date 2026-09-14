import { NextRequest, NextResponse } from "next/server";
import { creerJetonSuperAdmin, COOKIE_SUPER_ADMIN } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { motDePasse } = (await request.json()) as { motDePasse?: string };
  const motDePasseAttendu = process.env.SUPER_ADMIN_PASSWORD;

  if (!motDePasseAttendu || motDePasse !== motDePasseAttendu) {
    return NextResponse.json({ erreur: "Mot de passe incorrect." }, { status: 401 });
  }

  const jeton = creerJetonSuperAdmin();
  const reponse = NextResponse.json({ ok: true });
  reponse.cookies.set(COOKIE_SUPER_ADMIN, jeton, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return reponse;
}
