import Link from "next/link";
import { redirect } from "next/navigation";
import { getCommercantConnecte } from "@/lib/session";

const LIENS = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/dashboard/clients", label: "Clients" },
  { href: "/dashboard/parametres", label: "Parametres" },
  { href: "/dashboard/facturation", label: "Facturation" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const commercant = await getCommercantConnecte();
  if (!commercant) {
    redirect("/connexion");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="font-bold text-brand-600">Avis Facile</p>
            <p className="text-xs text-slate-500">{commercant.nom}</p>
          </div>
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
            {LIENS.map((lien) => (
              <Link key={lien.href} href={lien.href} className="hover:text-brand-600">
                {lien.label}
              </Link>
            ))}
            <form action="/api/auth/deconnexion" method="post">
              <button type="submit" className="text-slate-400 hover:text-slate-700">
                Deconnexion
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
