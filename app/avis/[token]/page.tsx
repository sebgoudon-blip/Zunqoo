import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ConfirmerAvisBouton from "@/components/ConfirmerAvisBouton";

export default async function PageAvis({ params }: { params: { token: string } }) {
  const client = await prisma.clientFinal.findUnique({
    where: { token: params.token },
    include: { commercant: true, codePromo: true },
  });

  if (!client) {
    notFound();
  }

  if (client!.codePromo) {
    redirect(`/merci/${client!.codePromo.code}`);
  }

  const lienAvis = client!.commercant.lienAvisGoogle;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-bold">Merci de votre visite chez {client!.commercant.nom} !</h1>
      <p className="mt-3 text-slate-600">
        Laissez votre avis Google, puis revenez confirmer ici pour recevoir votre code
        promo.
      </p>

      {lienAvis && (
        <a
          href={lienAvis}
          target="_blank"
          rel="noreferrer"
          className="mt-6 rounded-lg border border-brand-500 px-6 py-3 font-semibold text-brand-600 transition hover:bg-brand-50"
        >
          1. Laisser mon avis Google
        </a>
      )}

      <div className="mt-4">
        <p className="mb-3 text-sm text-slate-500">
          2. Une fois votre avis publie, confirmez ici :
        </p>
        <ConfirmerAvisBouton token={params.token} />
      </div>
    </main>
  );
}
