Cloudflare deployment (existing dental-clinic Worker and dr-wael-clinic-db)

npm run build
npx wrangler d1 migrations apply dr-wael-clinic-db --remote
npx wrangler deploy

ADMIN_EMAIL, ADMIN_PASSWORD and APP_SECRET are Cloudflare secrets. Local values are in the ignored .dev.vars file. Never commit that file.

Templates are precompiled from app/templates; original CSS and JS remain in app/static.
Uploads use the optional UPLOADS R2 binding. Without R2, D1 stores uploads up to 1 MiB each. Attach an R2 bucket as UPLOADS to allow files up to 10 MiB. Existing D1 uploads remain readable after attaching R2.

Local verification: apply migrations with --local, run npx wrangler dev, then node tests/cloudflare-smoke.mjs. Tests create synthetic appointments in the local database only by default. TEST_URL explicitly selects another environment.

Legacy import: set NETLIFY_DB_URL locally and run node cloudflare/export-netlify-data.mjs when the old database is reachable. The private SQL output goes to ignored work/d1-data-import.sql. Back up D1 before importing with wrangler d1 execute --remote --file. Existing media objects require copying separately; database metadata does not contain file bytes. Admin users are excluded; production uses the Cloudflare secrets.
