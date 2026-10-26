import { NavLink, Outlet } from "react-router-dom";
import { useAppState } from "../state";

export function Layout() {
  const { profile } = useAppState();
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">HT</span>
          HighTicket Pilot
        </NavLink>
        <nav className="topnav">
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
