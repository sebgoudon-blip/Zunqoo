import { redirect } from "next/navigation";
import { estSuperAdminConnecte } from "@/lib/session";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  if (!estSuperAdminConnecte()) {
    redirect("/super-admin/connexion");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <p className="font-bold">Avis Facile — Super Admin</p>
          <form action="/api/super-admin/deconnexion" method="post">
            <button type="submit" className="text-sm text-slate-300 hover:text-white">
              Deconnexion
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
