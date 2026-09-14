import { NextRequest, NextResponse } from "next/server";
import { stripe, stripeConfigure } from "@/lib/stripe";
import { getCommercantConnecte } from "@/lib/session";

export async function POST(request: NextRequest) {
  const commercant = await getCommercantConnecte();
  if (!commercant) {
    return NextResponse.json({ erreur: "Non authentifie." }, { status: 401 });
  }

  if (!stripeConfigure() || !commercant.stripeCustomerId) {
    return NextResponse.json(
      { erreur: "La facturation Stripe n'est pas configuree pour ce compte." },
      { status: 400 }
    );
  }

  const appUrl = process.env.APP_URL || request.nextUrl.origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: commercant.stripeCustomerId,
    return_url: `${appUrl}/dashboard/facturation`,
  });

  return NextResponse.json({ url: session.url });
}
