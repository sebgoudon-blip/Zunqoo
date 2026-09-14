import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifierMotDePasse, creerJetonSession, COOKIE_SESSION } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { email, motDePasse } = (await request.json()) as {
    email?: string;
    motDePasse?: string;
  };

  if (!email || !motDePasse) {
    return NextResponse.json({ erreur: "Email et mot de passe requis." }, { status: 400 });
  }

  const commercant = await prisma.commercant.findUnique({ where: { email } });
  if (!commercant) {
    return NextResponse.json({ erreur: "Identifiants incorrects." }, { status: 401 });
  }

  const motDePasseValide = await verifierMotDePasse(motDePasse, commercant.motDePasseHash);
  if (!motDePasseValide) {
    return NextResponse.json({ erreur: "Identifiants incorrects." }, { status: 401 });
  }

  const jeton = creerJetonSession(commercant.id);
  const reponse = NextResponse.json({ ok: true });
  reponse.cookies.set(COOKIE_SESSION, jeton, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return reponse;
}
