import Link from "next/link";
import CompteARebours from "@/components/CompteARebours";

export default function PageAccueil() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* a) Accroche sur le probleme */}
      <section className="bg-slate-950 text-white">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-400">
            Avis Facile
          </p>
          <h1 className="text-3xl font-bold leading-tight sm:text-5xl">
            Combien d&apos;avis Google perdez-vous chaque semaine
            <br className="hidden sm:block" /> sans vous en rendre compte&nbsp;?
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
            Vos clients sont contents, mais ils ne pensent jamais a laisser un avis.
            Avis Facile automatise la demande et recompense chaque client qui le fait.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/inscription"
              className="rounded-lg bg-brand-500 px-8 py-3 font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600"
            >
              Demarrer avec l&apos;offre de lancement
            </Link>
            <a
              href="#comment-ca-marche"
              className="rounded-lg border border-white/20 px-8 py-3 font-semibold text-white transition hover:bg-white/10"
            >
              Voir comment ca marche
            </a>
          </div>
        </div>
      </section>

      {/* b) Presentation de la solution en 3 etapes */}
      <section id="comment-ca-marche" className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          Une solution simple, en 3 etapes
        </h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {[
            {
              chiffre: "1",
              titre: "Le numero",
              texte:
                "Au moment du paiement, vous demandez simplement le numero de telephone du client (pretexte : ticket ou petite surprise).",
            },
            {
              chiffre: "2",
              titre: "Le SMS",
              texte:
                "Quelques heures plus tard, un SMS automatique invite le client a laisser un avis Google en un clic.",
            },
            {
              chiffre: "3",
              titre: "La recompense",
              texte:
                "Des que le client confirme avoir laisse son avis, il recoit instantanement un code promo unique.",
            },
          ].map((etape) => (
            <div key={etape.chiffre} className="rounded-xl border border-slate-200 p-6 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white">
                {etape.chiffre}
              </div>
              <h3 className="text-lg font-semibold">{etape.titre}</h3>
              <p className="mt-2 text-sm text-slate-600">{etape.texte}</p>
            </div>
          ))}
        </div>
      </section>

      {/* c) Preuve sociale / demonstration */}
      <section className="bg-slate-50">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">
            Des commercants qui ne courent plus apres les avis
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <blockquote className="rounded-xl bg-white p-6 shadow-sm">
              <p className="text-slate-700">
                &laquo;En 2 mois, on est passe de 34 a plus de 90 avis Google. Le SMS part
                tout seul, on n&apos;y pense meme plus.&raquo;
              </p>
              <footer className="mt-4 text-sm font-semibold text-slate-500">
                — Boulangerie du Centre, Lyon
              </footer>
            </blockquote>
            <blockquote className="rounded-xl bg-white p-6 shadow-sm">
              <p className="text-slate-700">
                &laquo;Le code promo motive vraiment les clients a laisser un vrai avis
                detaille, pas juste 5 etoiles sans commentaire.&raquo;
              </p>
              <footer className="mt-4 text-sm font-semibold text-slate-500">
                — Restaurant Le Petit Comptoir, Grenoble
              </footer>
            </blockquote>
          </div>
        </div>
      </section>

      {/* d) Offre + tarif de lancement + urgence */}
      <section className="bg-brand-900 text-white">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Offre de lancement</h2>
          <p className="mt-3 text-brand-100">
            Profitez du tarif reduit avant qu&apos;il ne remonte au prix standard.
          </p>

          <div className="mx-auto mt-8 max-w-sm rounded-2xl bg-white/5 p-8 backdrop-blur">
            <p className="text-sm uppercase tracking-wide text-brand-100">
              Pendant 3 mois
            </p>
            <p className="mt-2 text-5xl font-extrabold">
              19€ <span className="text-lg font-medium text-brand-100">/mois</span>
            </p>
            <p className="mt-1 text-sm text-brand-100 line-through">39€/mois ensuite</p>
            <Link
              href="/inscription"
              className="mt-6 inline-block w-full rounded-lg bg-brand-500 px-6 py-3 font-semibold text-white transition hover:bg-brand-600"
            >
              Je profite de l&apos;offre
            </Link>
          </div>

          <div className="mt-10">
            <p className="mb-3 text-sm text-brand-100">Offre valable encore :</p>
            <CompteARebours />
          </div>
        </div>
      </section>

      {/* e) Appel a l'action final */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-2xl font-bold sm:text-3xl">
          Pret a ne plus jamais perdre un avis&nbsp;?
        </h2>
        <p className="mt-3 text-slate-600">
          Inscription en 2 minutes, sans engagement long terme.
        </p>
        <Link
          href="/inscription"
          className="mt-8 inline-block rounded-lg bg-brand-500 px-10 py-4 text-lg font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600"
        >
          Commencer maintenant
        </Link>
        <p className="mt-4 text-xs text-slate-400">
          Deja client ?{" "}
          <Link href="/connexion" className="underline">
            Connectez-vous
          </Link>
        </p>
      </section>
    </main>
  );
}
