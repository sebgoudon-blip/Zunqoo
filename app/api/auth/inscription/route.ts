import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashMotDePasse, creerJetonSession, COOKIE_SESSION } from "@/lib/auth";
import { stripe, stripeConfigure, idPrixPourPlan } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { nom, email, motDePasse, telephone, lienAvisGoogle, plan } = body as {
    nom?: string;
    email?: string;
    motDePasse?: string;
    telephone?: string;
    lienAvisGoogle?: string;
    plan?: string;
  };

  if (!nom || !email || !motDePasse) {
    return NextResponse.json(
      { erreur: "Nom, email et mot de passe sont requis." },
      { status: 400 }
    );
  }

  if (motDePasse.length < 8) {
    return NextResponse.json(
      { erreur: "Le mot de passe doit contenir au moins 8 caracteres." },
      { status: 400 }
    );
  }

  const existant = await prisma.commercant.findUnique({ where: { email } });
  if (existant) {
    return NextResponse.json(
      { erreur: "Un compte existe deja avec cet email." },
      { status: 409 }
    );
  }

  const planChoisi = plan === "standard" ? "standard" : "lancement";
  const motDePasseHash = await hashMotDePasse(motDePasse);

  const commercant = await prisma.commercant.create({
    data: {
      nom,
      email,
      motDePasseHash,
      telephone: telephone || null,
      lienAvisGoogle: lienAvisGoogle || null,
      plan: planChoisi,
    },
  });

  const jeton = creerJetonSession(commercant.id);
  const reponse = NextResponse.json({ ok: true, redirection: "/dashboard" });
  reponse.cookies.set(COOKIE_SESSION, jeton, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  // Si Stripe est configure, on cree la session de paiement et on redirige vers Stripe Checkout.
  if (stripeConfigure()) {
    const idPrix = idPrixPourPlan(planChoisi);
    if (idPrix) {
      try {
        const client = await stripe.customers.create({
          email,
          name: nom,
          metadata: { commercantId: commercant.id },
        });

        await prisma.commercant.update({
          where: { id: commercant.id },
          data: { stripeCustomerId: client.id },
        });

        const appUrl = process.env.APP_URL || "http://localhost:3000";
        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer: client.id,
          line_items: [{ price: idPrix, quantity: 1 }],
          success_url: `${appUrl}/dashboard?paiement=succes`,
          cancel_url: `${appUrl}/dashboard?paiement=annule`,
          metadata: { commercantId: commercant.id },
        });

        return NextResponse.json(
          { ok: true, redirection: session.url },
          { headers: reponse.headers }
        );
      } catch (err) {
        console.error("[STRIPE] Erreur creation checkout:", err);
        // On laisse quand meme le commercant acceder au dashboard, en statut "essai".
      }
    }
  }

  return reponse;
}
