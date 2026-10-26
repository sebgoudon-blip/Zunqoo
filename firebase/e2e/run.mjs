// Lance les tests de bout en bout : compile les fonctions, écrit une
// configuration et des secrets factices (émulateur uniquement), démarre
// les émulateurs puis Vitest.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

// Valeurs factices : l'émulateur appelle le faux Shopify local, jamais le vrai.
writeFileSync(
  join(root, "firebase/e2e/functions/.env"),
  "HTP_APP_URL=http://127.0.0.1:5173\nHTP_SHOPIFY_MOCK_ORIGIN=http://127.0.0.1:8799\n"
);
writeFileSync(
  join(root, "firebase/e2e/functions/.secret.local"),
  ["SHOPIFY_CLIENT_ID=client-id-factice", "SHOPIFY_CLIENT_SECRET=secret-factice", "ANTHROPIC_API_KEY=cle-factice"].join("\n") + "\n"
);
run("npm run build:functions");
run(
  'npx firebase emulators:exec --config firebase.e2e.json --project demo-htp --only auth,firestore,functions "npx vitest run --config firebase/e2e/vitest.config.ts"'
);
