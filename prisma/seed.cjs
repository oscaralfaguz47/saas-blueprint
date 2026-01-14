const { PrismaClient, RoleKey } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;

  if (!adminEmail) {
    console.log("BOOTSTRAP_ADMIN_EMAIL is not set. Skipping seed.");
    return;
  }

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: RoleKey.ADMIN },
    create: { email: adminEmail, role: RoleKey.ADMIN, name: "Bootstrap Admin" },
  });

  console.log(`Seeded admin: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
