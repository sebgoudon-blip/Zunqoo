import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

function statutDepuisStripe(statutStripe: Stripe.Subscription.Status): string {
  switch (statutStripe) {
    case "active":
    case "trialing":
      return "actif";
    case "past_due":
    case "unpaid":
      return "impaye";
    case "canceled":
    case "incomplete_expired":
      return "annule";
    default:
      return "essai";
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  const corps = await request.text();

  if (!secret || !signature) {
    return NextResponse.json({ erreur: "Webhook Stripe non configure." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(corps, signature, secret);
  } catch (err) {
    console.error("[STRIPE WEBHOOK] Signature invalide:", err);
    return NextResponse.json({ erreur: "Signature invalide." }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const commercantId = session.metadata?.commercantId;
      if (commercantId && session.subscription) {
        await prisma.commercant.update({
          where: { id: commercantId },
          data: {
            stripeSubscriptionId: session.subscription as string,
            statutAbonnement: "actif",
          },
        });
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const commercant = await prisma.commercant.findFirst({
        where: { stripeCustomerId: subscription.customer as string },
      });
      if (commercant) {
        await prisma.commercant.update({
          where: { id: commercant.id },
          data: { statutAbonnement: statutDepuisStripe(subscription.status) },
        });
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const commercant = await prisma.commercant.findFirst({
        where: { stripeCustomerId: invoice.customer as string },
      });
      if (commercant) {
        await prisma.commercant.update({
          where: { id: commercant.id },
          data: { statutAbonnement: "impaye" },
        });
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ recu: true });
}
