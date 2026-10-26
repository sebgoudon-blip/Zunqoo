// Charge les fonctions HighTicket compilées pour l'émulateur. Ce dossier sert
// uniquement aux tests : firebase.json (déploiement) ne le référence pas, et
// l'export de production reste désactivé dans firebase/functions/src/index.ts.
const { initializeApp, getApps } = require("firebase-admin/app");
if (!getApps().length) initializeApp();
module.exports = require("../../functions/lib/highTicket");
