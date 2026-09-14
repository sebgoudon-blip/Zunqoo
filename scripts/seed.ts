import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@avisfacile.fr";
  const motDePasseHash = await bcrypt.hash("motdepasse123", 10);

  const commercant = await prisma.commercant.upsert({
    where: { email },
    update: {},
    create: {
      nom: "Boulangerie du Centre (demo)",
      email,
      motDePasseHash,
      telephone: "+33612345678",
      lienAvisGoogle: "https://g.page/r/exemple-avis-google",
      delaiEnvoiHeures: 3,
      plan: "lancement",
      statutAbonnement: "essai",
    },
  });

  await prisma.clientFinal.upsert({
    where: { token: "demo-client-token" },
    update: {},
    create: {
      commercantId: commercant.id,
      telephone: "+33698765432",
      token: "demo-client-token",
      envoyerApres: new Date(Date.now() - 1000 * 60), // deja "du" pour tester le cron
    },
  });

  console.log("Compte demo cree :");
  console.log(`  email: ${email}`);
  console.log(`  mot de passe: motdepasse123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
