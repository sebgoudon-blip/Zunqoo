import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div className="setup-screen">
      <div className="setup-card">
        <h1>Zunqoo</h1>
        <p>Choisissez l'interface à ouvrir sur cet appareil :</p>
        <div className="home-links">
          <Link className="btn btn-primary btn-large" to="/caisse">
            Interface caisse
          </Link>
          <Link className="btn btn-secondary btn-large" to="/display">
            Écran d'affichage
          </Link>
        </div>
      </div>
    </div>
  );
}
