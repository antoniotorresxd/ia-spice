import { seedCircuitKnowledge } from "./circuit.services";

async function main() {
  console.log("🌱 Semillando base de conocimiento de circuitos en Neon Postgres...");
  try {
    const { seeded } = await seedCircuitKnowledge();
    console.log(`✅ ¡Éxito! Se semillaron ${seeded} topologías teóricas de circuitos en Neon.`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error al semillar la base de datos:", error);
    process.exit(1);
  }
}

main();
