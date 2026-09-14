import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avis Facile — Automatisez vos avis Google",
  description:
    "Collectez plus d'avis Google automatiquement et recompensez vos clients avec un code promo, sans effort au quotidien.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
