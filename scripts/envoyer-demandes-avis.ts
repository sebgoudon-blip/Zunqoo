import { envoyerDemandesAvisEnAttente } from "../lib/tachesPlanifiees";

envoyerDemandesAvisEnAttente()
  .then((resultat) => {
    console.log(`Demandes d'avis: ${resultat.envoyes} envoyees, ${resultat.ignores} ignorees (sur ${resultat.total}).`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Erreur lors de l'envoi des demandes d'avis:", err);
    process.exit(1);
  });
