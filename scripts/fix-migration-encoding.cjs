/**
 * Fix P3015 on Windows: rewrite all migration.sql files as UTF-8 (no BOM).
 * Run: node scripts/fix-migration-encoding.cjs
 */
const fs = require("fs");
const path = require("path");

const migrationsDir = path.join(__dirname, "..", "prisma", "migrations");
const dirs = fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory());

let fixed = 0;
for (const dir of dirs) {
  const sqlPath = path.join(migrationsDir, dir.name, "migration.sql");
  if (!fs.existsSync(sqlPath)) {
    console.warn("Skip (no migration.sql):", dir.name);
    continue;
  }
  const buf = fs.readFileSync(sqlPath);
  let content;
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    content = buf.toString("utf16le");
  } else if (buf[0] === 0xfe && buf[1] === 0xff) {
    content = buf.toString("utf16be");
  } else {
    content = buf.toString("utf8");
  }
  fs.writeFileSync(sqlPath, content, "utf8");
  console.log("UTF-8:", dir.name);
  fixed++;
}
console.log("Done. Fixed", fixed, "migration file(s). Run: npx prisma migrate status");
