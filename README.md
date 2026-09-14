# Meetbeatz — Beat Store & Studio Bookings

A full-stack Next.js + PostgreSQL app where **only Meetbeatz (admin) can upload beats**, customers buy licenses with **Mobile Money (MTN, Telecel/Vodafone, AirtelTigo) or card via Paystack**, receive their **files + license certificate by email**, and can **book studio time** (recording, mixing, mastering).

## How the money is split

Every checkout charges the customer `price + service fee` (default **10%**, editable in Admin → Settings).

- The **beat price / booking deposit** settles to **Meetbeatz's bank account or MoMo wallet** (a Paystack *subaccount*).
- The **fee** stays in the **main Paystack account** (the separate "fee" account).

This is done with Paystack split payments: each transaction is initialised with `subaccount = <Meetbeatz subaccount>` and `transaction_charge = <fee amount>`, so Paystack routes the two amounts to two different settlement accounts automatically. You can create the subaccount from Admin → Settings (bank or Mobile Money wallet) or paste one from the Paystack dashboard.

## Run locally in VS Code

**1. Get the code onto your computer** (any one of these):

- Use your platform's **Download / Export** or **Connect to GitHub** button, or
- Download the source archive served by the running app: `<preview-url>/meetbeatz-source.zip` (delete `public/meetbeatz-source.zip` afterwards), or
- If it's already on GitHub: `git clone <your-repo-url>`

**2. Open the folder in VS Code**: `File → Open Folder…` and pick the project folder (or run `code .` inside it). Click **Install** when VS Code offers the recommended extensions.

**3. Install the requirements**: [Node.js 22+](https://nodejs.org), and either [Docker Desktop](https://www.docker.com/products/docker-desktop/) (easiest) or a local PostgreSQL 15+.

**4. In the VS Code terminal** (`` Ctrl+` `` / `` Cmd+` ``):

```bash
npm install                 # install dependencies
cp .env.example .env        # Windows PowerShell: copy .env.example .env
npm run db:setup            # start PostgreSQL + create the tables (one command, safe to re-run)
npm run dev                 # start the site
```

Then open <http://localhost:3000>. The demo beats, license types, services and the admin account are created automatically on first load.

`npm run db:setup` reads `DATABASE_URL` from `.env`, checks that PostgreSQL answers there, starts the Docker database if nothing is listening, runs `drizzle-kit push` and prints the tables it found. If the database is misconfigured it tells you exactly what is wrong (wrong password, missing database, server not running).

> Tip: `Terminal → Run Task… → Setup everything` runs the database, schema and dev-server steps for you, and `F5` starts the debugger.

### Database scripts

| Command | What it does |
| --- | --- |
| `npm run db:setup` | Start the database (if needed) + create/update all tables |
| `npm run db:push` | Only create/update tables from `src/db/schema.ts` |
| `npm run db:up` | Start the Docker database only |
| `npm run db:down` | Stop the Docker database (data is kept) |

All database settings come from `DATABASE_URL` in `.env`: `drizzle.config.ts` and `docker-compose.yml` both follow it, so there is only one value to change when you switch databases.

### Troubleshooting the database

| Error | Cause & fix |
| --- | --- |
| `Cannot find module 'dotenv/config'` | Run `npm install` first. |
| `DATABASE_URL is not set` | You have no `.env`. Run `cp .env.example .env` (PowerShell: `copy .env.example .env`). |
| `connect ECONNREFUSED 127.0.0.1:5432` | No database server on that port. Run `npm run db:up`, or start your local PostgreSQL service (Windows: `Start-Service postgresql-x64-18`). |
| `password authentication failed for user "postgres"` | The password in `DATABASE_URL` differs from the server's. Update `DATABASE_URL`, or run `ALTER USER postgres WITH PASSWORD 'natthesisa';` in pgAdmin/psql. |
| `database "app_db" does not exist` | Create it: `createdb -U postgres app_db`. |
| `relation "beats" does not exist` | The tables were never created. Run `npm run db:setup`. |
| `port is already allocated` from Docker | Something (often a local PostgreSQL install) already uses port 5432. Stop that service, or run `POSTGRES_PORT=5433 npm run db:up` and set `DATABASE_URL=…@127.0.0.1:5433/app_db`. |
| `self-signed certificate in certificate chain` | Your network is intercepting TLS. Use `?uselibpqcompat=true&sslmode=require` in `DATABASE_URL`, or connect from another network. |
| Data resets after every restart | `docker compose down -v` deletes the volume — use `npm run db:down` (without `-v`) to keep your data. |

`npm run db:setup` checks all of the above for you and prints the specific fix.

### 5. Push to GitHub (optional)

```bash
git init && git add . && git commit -m "Meetbeatz beat store"
git branch -M main
git remote add origin https://github.com/<you>/meetbeatz.git
git push -u origin main
```

`.env`, `node_modules`, `.next`, `uploads/` and the local database folder are already ignored by `.gitignore`. Never commit `.env` — it holds your database password, session secret and email credentials. `.env.example` (safe to commit) documents every variable.

## Deploy to Vercel

**1. Create a hosted PostgreSQL.** Free options that need no card: [Neon](https://neon.tech) (recommended), [Supabase](https://supabase.com) or [Railway](https://railway.app). Create the project, pick a European region (Frankfurt/London/Paris — the closest to Accra, and the region pinned in `vercel.json`), then copy the connection string. It must end with `?sslmode=require`.

> **Important:** a database on your own computer cannot be used here. `127.0.0.1` / `localhost` in `DATABASE_URL` means "this machine" — on Vercel that is *their* server, where your database does not exist. The deployed app needs the internet-reachable address your provider gives you (e.g. `ep-cool-name-123456.eu-central-1.aws.neon.tech`).

**2. Run one command** from this folder, passing the hosted URL (your `.env` can keep using your local database for development):

```bash
# macOS / Linux
DATABASE_URL="postgresql://user:password@host:5432/app_db?sslmode=require" npm run deploy

# Windows PowerShell
$env:DATABASE_URL="postgresql://user:password@host:5432/app_db?sslmode=require"; npm run deploy
```

It refuses to continue if `DATABASE_URL` still points at your own machine, creates the tables in the hosted database, writes `.env.production`, logs you into Vercel, uploads every variable to Production + Preview and deploys. If the Vercel CLI cannot run, it prints the browser steps instead and leaves `.env.production` ready to bulk-paste into Vercel's Environment Variables page.

**3. Open the deployed site once** so the database seeds (demo beats, license types, studio services, your admin account), then log in at `/admin/login` with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

**4. Paystack**: set the webhook URL to `https://your-domain/api/paystack/webhook` (event `charge.success`), and create the payout subaccount in Admin → Settings.

> Only the tables step needs a "real" deployment — run `npm run deploy -- --db-only` any time you just want to push schema changes to the hosted database.

### Environment variables at a glance

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the hosted connection string (with `?sslmode=require`) |
| `SESSION_SECRET` | long random string — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | your real admin login (used on first seed only) |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain.vercel.app` (or `https://meetbeatz.com`) |
| `PAYSTACK_SECRET_KEY` | `sk_live_…` for real payments, leave empty for test mode |
| `PAYMENT_MODE` | `paystack` for live money, `simulation` for testing |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | email delivery (app password, spaces are fine) |
| `EMAIL_FROM` | `Meetbeatz <no-reply@meetbeatz.com>` |

### What works on Vercel and what doesn't

- **Everything works except storing uploaded files.** Vercel functions have a read-only, ephemeral filesystem, so admin uploads (cover art, MP3/WAV/stems) cannot be written there. On upload the admin sees a message saying exactly this instead of a crash. To accept uploads in production either (a) host the app on a VPS/Railway with a persistent volume, or (b) move uploads to object storage (Cloudinary, S3, R2) — the note in `DEPLOYMENT.md` covers this; `UPLOAD_DIR` can point at any writable path.
- **Uploads are also capped at 4.5 MB per request** on Vercel, which most WAV files exceed — another reason to use object storage or a VPS for uploads.
- **Demo beats keep working.** Their audio is generated by the synthesizer on demand, so the storefront, previews and downloads are playable even with no writable disk.
- The storefront, checkout, Paystack, emails, licenses, downloads and bookings are all dynamic and work normally.

## Admin login

- URL: `/admin/login`
- Default credentials: `admin@meetbeatz.com` / `meetbeatz123` (change under Settings, or set `ADMIN_EMAIL` / `ADMIN_PASSWORD` before first run).

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string — the only place the database is configured (see `.env.example`) |
| `PAYSTACK_SECRET_KEY` | Enables live Paystack payments. Without it the app runs in **test mode** with a simulated MoMo prompt. |
| `NEXT_PUBLIC_APP_URL` | Public URL used in emails and the Paystack callback (auto-detected if unset) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Email delivery through Gmail (create an app password at <https://myaccount.google.com/apppasswords>) — this is what the app uses by default |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | Any other email provider over SMTP (Zoho, Brevo, Mailgun…) |
| `RESEND_API_KEY` | Alternative email delivery via Resend |
| `EMAIL_FROM` | Sender, e.g. `Meetbeatz <no-reply@meetbeatz.com>` |
| `SESSION_SECRET` | Secret for admin session cookies |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Initial admin account (first run only) |

Paystack webhook URL: `https://<your-domain>/api/paystack/webhook` (event `charge.success`).

## Features

- **Public store**: full-length previews with a global audio player, search & genre filters, per-beat license pricing (Basic / Premium / Unlimited / Exclusive), transparent fee breakdown.
- **Checkout**: customer name, email, network + MoMo number → Paystack (or simulated prompt in test mode) → verification → licenses issued → email with download links + printable license certificate.
- **Downloads**: token-protected links tied to the license (MP3 / WAV / stems as included).
- **Studio bookings**: services, opening hours, live slot availability with conflict prevention, deposit payment, email confirmation, balance due at studio.
- **Admin dashboard**: revenue split overview, beat upload with progress (cover, tagged preview, MP3, WAV, stems), license/price management, orders (resend email), bookings (confirm / complete / cancel), services & hours, license types, settings, payout subaccount creator, test email, password change.

Uploaded files are stored in `./uploads` (outside `public/`) and streamed through protected API routes.
