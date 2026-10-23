import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { AuthProvider, useAuth } from "./auth";
import { AgendaPage } from "./pages/Agenda";
import { ApprovalsPage } from "./pages/Approvals";
import { CatalogPage } from "./pages/Catalog";
import { ContactDetailPage } from "./pages/ContactDetail";
import { ContactsPage } from "./pages/Contacts";
import { DashboardPage } from "./pages/Dashboard";
import { LoginPage } from "./pages/Login";
import { ModulesPage } from "./pages/Modules";
import { InvoiceEditorPage } from "./pages/InvoiceEditor";
import { InvoicesPage } from "./pages/Invoices";
import { QuoteEditorPage } from "./pages/QuoteEditor";
import { QuotesPage } from "./pages/Quotes";
import { SignPage } from "./pages/Sign";
import { Icon, Spinner, type IconName } from "./ui";

const NAV: { to: string; label: string; icon: IconName; module?: string; desktopOnly?: boolean }[] = [
  { to: "/", label: "Accueil", icon: "home" },
  { to: "/a-valider", label: "À valider", icon: "checkCircle" },
  { to: "/clients", label: "Clients", icon: "users" },
  { to: "/devis", label: "Ventes", icon: "note", module: "devis" },
  { to: "/agenda", label: "Agenda", icon: "calendar", module: "rendez_vous", desktopOnly: true },
  { to: "/factures", label: "Factures", icon: "note", module: "factures", desktopOnly: true },
  // Sur téléphone, le catalogue est accessible depuis Réglages (5 onglets maximum).
  { to: "/catalogue", label: "Catalogue", icon: "box", desktopOnly: true },
  { to: "/reglages", label: "Réglages", icon: "settings" },
];

function usePendingCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get<{ pending_approvals: number }>("/api/dashboard")
        .then((d) => alive && setCount(d.pending_approvals))
        .catch(() => {});
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  return count;
}

function Layout() {
  const { me, logout, hasModule } = useAuth();
  const pending = usePendingCount();
  return (
    <div className="shell">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">Z</span>
          <div>
            <strong>{me?.business.name}</strong>
            <span>{me?.business.activity}</span>
          </div>
        </div>
        <nav aria-label="Navigation principale">
          {NAV.filter((item) => !item.module || hasModule(item.module)).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"}
                     className={`nav-link ${item.desktopOnly ? "desktop-only" : ""}`}>
              <Icon name={item.icon} />
              <span>{item.to === "/devis" && hasModule("factures") ? <><span className="desktop-only">Devis</span><span className="mobile-only">Ventes</span></> : item.to === "/devis" ? "Devis" : item.label}</span>
              {item.to === "/a-valider" && pending > 0 && (
                <span className="badge" aria-label={`${pending} en attente`}>
                  {pending}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <button className="nav-link logout" onClick={logout}>
          <Icon name="logout" />
          <span>Se déconnecter</span>
        </button>
      </aside>
      <main id="contenu" className="content">
        <Outlet />
      </main>
    </div>
  );
}

function Protected() {
  const { me, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!me) return <Navigate to="/connexion" replace />;
  return <Layout />;
}

function PublicOnly() {
  const { me, loading } = useAuth();
  if (loading) return <Spinner />;
  return me ? <Navigate to="/" replace /> : <LoginPage />;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/connexion" element={<PublicOnly />} />
          {/* Page publique : le client signe sans compte, le lien suffit. */}
          <Route path="/signer/:token" element={<SignPage />} />
          <Route element={<Protected />}>
            <Route index element={<DashboardPage />} />
            <Route path="a-valider" element={<ApprovalsPage />} />
            <Route path="clients" element={<ContactsPage />} />
            <Route path="clients/:id" element={<ContactDetailPage />} />
            <Route path="catalogue" element={<CatalogPage />} />
            <Route path="devis" element={<QuotesPage />} />
            <Route path="devis/:id" element={<QuoteEditorPage />} />
            <Route path="agenda" element={<AgendaPage />} />
            <Route path="factures" element={<InvoicesPage />} />
            <Route path="factures/:id" element={<InvoiceEditorPage />} />
            <Route path="reglages" element={<ModulesPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
