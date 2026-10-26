import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { useAppState } from "../state";

export function Layout() {
  const { profile } = useAppState();
  const { cloudEnabled, user } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="HighTicket Pilot, accueil">
          <span className="brand-mark" aria-hidden="true">HT</span>
          <span className="brand-name">HighTicket Pilot</span>
        </NavLink>
        <nav className="topnav" aria-label="Navigation principale">
          <NavLink to="/parcours">Parcours</NavLink>
          <NavLink to="/outils">Outils</NavLink>
          {cloudEnabled && <NavLink to="/boutique">Boutique</NavLink>}
          <NavLink to="/profil">{profile ? "Profil" : "Commencer"}</NavLink>
          {cloudEnabled && (
            <NavLink to="/compte" className="nav-account" aria-label={user ? "Mon compte" : "Se connecter"}>
              {user ? <span className="avatar">{(user.email ?? user.displayName ?? "?").charAt(0).toUpperCase()}</span> : "Connexion"}
            </NavLink>
          )}
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
