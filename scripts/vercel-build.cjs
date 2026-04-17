/**
 * Vercel build script: migrations on every deploy, seed only when RUN_SEED is truthy.
 * Cross-platform (Node execSync), no shell-specific conditionals.
 * Order: prisma generate → prisma migrate deploy → [prisma db seed if RUN_SEED] → next build.
 */
const { execSync } = require("child_process");

function isTruthyEnv(value) {
  if (value === undefined || value === null) return false;
  const s = String(value).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function run(name, command) {
  console.log("[vercel-build] " + name + "...");
  try {
    execSync(command, { stdio: "inherit", cwd: process.cwd() });
  } catch (err) {
    console.error("[vercel-build] Failed: " + name + ". Fix the error above and redeploy.");
    process.exit(1);
  }
}

const runSeed = isTruthyEnv(process.env.RUN_SEED);

run("prisma generate", "npx prisma generate");
run("prisma migrate deploy", "npx prisma migrate deploy");
run("sync role permissions", "npm run sync:role-permissions");

if (runSeed) {
  console.log("[vercel-build] RUN_SEED is true -> running prisma db seed...");
  run("prisma db seed", "npx prisma db seed");
} else {
  console.log("[vercel-build] RUN_SEED is not true -> skipping prisma db seed.");
}

run("next build", "npx next build");

console.log("[vercel-build] Done.");
