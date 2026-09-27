import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const out = resolve("public/static");
rmSync(out, { recursive: true, force: true });
mkdirSync(resolve("public"), { recursive: true });
cpSync(resolve("app/static"), out, { recursive: true });
console.log("Static assets copied to public/static");
