# Dr. Wael Al-Bash Dental Platform

Production-oriented dental platform for Dr. Wael Al-Bash: multilingual public site (AR/TR/EN), booking with DB-level double-booking protection, patient files, clinical cases, CMS settings, media library, audit log, and Arabic RTL dashboard.

## Run
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# set environment variables from .env (or use your host's env manager)
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Open: `http://localhost:8000`
Admin: `http://localhost:8000/admin/login`

## Default development admin
- Email: `admin@waelbash.local`
- Password: `ChangeMe!123`
Change both before public deployment.


## Premium frontend refresh
The public homepage now uses the approved premium medical direction: a cleaner doctor hero using the real Dr. Wael photo, responsive RTL/LTR layout, stronger CTAs, and local 3D dental service visuals instead of emoji placeholders. Service visuals remain overridable through each service image field, and the hero remains controlled by the `hero_image` CMS setting.

## Database
Local default: SQLite (`data/wael.db`) for zero-config development. Set `DATABASE_URL` to PostgreSQL-compatible URL in production. SQLAlchemy models are portable. The `appointments.slot_key` unique constraint is the DB-level guard against double booking; cancelled/rejected appointments release it.

## Email
Real Resend API integration is implemented. Set `RESEND_API_KEY` and a verified `EMAIL_FROM`. Without a key, emails are not pretended to be sent; they are logged with status `configuration_required` in `email_logs`.

## Security baseline
Signed HttpOnly admin session, scrypt password hashing, server-side validation, ORM queries, authorization on patient/admin routes, MIME/size checks for uploads, CSP/security headers, private patient files, audit logging.

## Tests
```bash
pytest -q
```
Tests cover public pages/languages, booking availability, DB-level double booking failure, admin login, confirm flow, audit log, service creation, private patient file, sitemap/robots.

## Production checklist
- Set a strong `APP_SECRET`
- Use PostgreSQL + backups
- Set HTTPS `BASE_URL`
- Configure Resend key/sender domain
- Replace temporary phone/address when clinic opens
- Put uploads behind durable object storage (S3/R2/Supabase Storage) if deploying to ephemeral hosts
- Place app behind a reverse proxy/CDN with production rate limiting/WAF


## Frontend V3
- Premium responsive redesign with 3D dental visuals.
- Dedicated `app/static/home-v3.css` keeps the public redesign isolated from admin styles.
- Hero uses the real Dr. Wael photo and CMS-controlled `hero_image` setting.
- Service cards remain database-driven and use 3D fallbacks by service slug.

## V8 premium production UI
- Reference-driven premium public homepage with a three-part hero: real Dr. Wael photography, premium Arabic typography/CTAs, and local 3D dental art.
- Purpose-built responsive/mobile layout (not desktop shrinking) with mobile drawer, touch-friendly CTAs, and horizontally scrollable service cards.
- Production-ready video section and modal. Set `video_url` in Admin CMS to a YouTube URL or uploaded MP4 path; upload MP4 from Media > Videos and use its `/static/uploads/media/...` path.
- CSS/JS micro-interactions: reveal-on-scroll, 3D float, service hover motion, sticky-header transitions, animated mobile menu, and reduced-motion support.
- Before/After cases use a touch-friendly draggable comparison control.
- Reviews and FAQ are real CMS-backed tables; no fake reviews are shown when none are published.
- Articles, hero copy/image, video content, contact information and doctor biography remain CMS-managed.
- `home-v8.css`, `home-v8.js`, `booking-v8.css`, and `booking-v8.js` isolate the refreshed patient experience from admin styling.
