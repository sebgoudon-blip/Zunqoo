import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function PageMerci({ params }: { params: { code: string } }) {
  const promo = await prisma.promoCode.findUnique({
    where: { code: params.code },
    include: { commercant: true },
  });

  if (!promo) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-bold">Merci pour votre avis !</h1>
      <p className="mt-3 text-slate-600">
        Voici votre code promo de {promo!.pourcentage}% chez {promo!.commercant.nom},
        a presenter lors de votre prochain passage.
      </p>

      <div className="mt-8 rounded-xl border-2 border-dashed border-brand-500 bg-brand-50 px-8 py-6">
        <p className="font-mono text-3xl font-bold tracking-widest text-brand-700">
          {promo!.code}
        </p>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Ce code a ete envoye par SMS au numero que vous avez communique en caisse.
      </p>
    </main>
  );
}
