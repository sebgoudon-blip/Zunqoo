import { NavLink, Outlet } from "react-router-dom";
import { useAppState } from "../state";

export function Layout() {
  const { profile } = useAppState();
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
          <NavLink to="/profil">{profile ? "Mon profil" : "Commencer"}</NavLink>
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
