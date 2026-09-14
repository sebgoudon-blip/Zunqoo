import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

// En dev sans cle Stripe, on garde une instance factice pour ne pas planter
// l'import ailleurs dans l'app ; les routes qui l'utilisent verifient la cle.
export const stripe = new Stripe(stripeSecretKey || "sk_test_placeholder", {
  apiVersion: "2024-06-20",
});

export const stripeConfigure = () => Boolean(stripeSecretKey);

export function idPrixPourPlan(plan: string): string | undefined {
  if (plan === "standard") return process.env.STRIPE_PRICE_ID_STANDARD;
  return process.env.STRIPE_PRICE_ID_LANCEMENT;
}
