process.env.TZ = "UTC";

import fs from "node:fs";
import { getDatabase } from "@netlify/database";

if (!process.env.NETLIFY_DB_URL) throw new Error("NETLIFY_DB_URL missing");
const db = getDatabase({ connectionString: process.env.NETLIFY_DB_URL });

const tables = [
  "patients",
  "services",
  "appointments",
  "articles",
  "audit_logs",
  "blocked_dates",
  "clinical_cases",
  "clinical_notes",
  "email_logs",
  "faq",
  "media",
  "messages",
  "reviews",
  "site_settings",
  "treatment_plans",
  "users",
  "working_hours",
  "patient_files",
  "appointment_slot_overrides"
];

function ident(v) {
  return `"${String(v).replaceAll('"','""')}"`;
}

function sqlValue(v) {
  if (v === null || v === undefined) return "NULL";

  if (typeof v === "boolean") return v ? "1" : "0";

  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "NULL";
    return String(v);
  }

  if (v instanceof Date) {
    v = v.toISOString().replace("T"," ").replace("Z","");
  }

  const s = String(v).replaceAll("'", "''");
  return `'${s}'`;
}

await db.pool.query("SET TIME ZONE 'Europe/Istanbul'");

let output = `PRAGMA foreign_keys = OFF;\n\n`;

for (const table of tables) {
  let rows;

  try {
    rows = (await db.pool.query(`SELECT * FROM ${ident(table)} ORDER BY id`)).rows;
  } catch (e) {
    if (table === "site_settings") {
      rows = (await db.pool.query(`SELECT * FROM ${ident(table)} ORDER BY "key"`)).rows;
    } else {
      console.log(`SKIP ${table}: ${e.message}`);
      continue;
    }
  }

  console.log(`${table}: ${rows.length}`);

  if (!rows.length) continue;

  output += `\n-- ${table}\n`;

  for (const row of rows) {
    const columns = Object.keys(row);

    output +=
      `INSERT OR REPLACE INTO ${ident(table)} (` +
      columns.map(ident).join(",") +
      `) VALUES (` +
      columns.map(c => sqlValue(row[c])).join(",") +
      `);\n`;
  }
}

output += `\nPRAGMA foreign_keys = ON;\n`;

fs.mkdirSync("cloudflare", { recursive: true });
fs.writeFileSync(
  "cloudflare/d1-data-import.sql",
  output,
  "utf8"
);

console.log("");
console.log("EXPORT COMPLETE");
console.log("Created: cloudflare/d1-data-import.sql");

await db.pool.end();


