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
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
docker compose up -d        # start PostgreSQL (skip if you use your own Postgres)
npm run db:create           # create the app_db database (already done by the container)
npm run db:push             # create the database tables
npm run doctor              # check that the app can reach the database
npm run dev                 # start the site
```

`DATABASE_URL` in `.env` must match the server you picked — the two options are spelled out
in `.env.example` (a local install is usually `127.0.0.1:5432`, the container is published on
`127.0.0.1:5433`). `npm run doctor` prints which one the app is actually using and what is wrong.

Then open <http://localhost:3000>. The demo beats, license types, services and the admin account are created automatically on first load.

> Tip: `Terminal → Run Task… → Setup everything` runs the database, schema and dev-server steps for you, and `F5` starts the debugger.

### The preview is blank or shows "This page could not be found"

Every page except a plain 404 reads from PostgreSQL on first load, so a database that is not
reachable surfaces as a server error on the whole site rather than a clear message. Run
`npm run doctor` — it reports the exact connection string, whether the port is open, whether the
database and tables exist, and how to fix each one. The usual causes are a database that was never
started, or a `DATABASE_URL` port that does not match the server you started.

### 5. Push to GitHub (optional)

```bash
git init && git add . && git commit -m "Meetbeatz beat store"
git branch -M main
git remote add origin https://github.com/<you>/meetbeatz.git
git push -u origin main
```

`.env`, `node_modules`, `.next` and `uploads/` are already ignored by `.gitignore`.

## Admin login

- URL: `/admin/login`
- The credentials are whatever `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` said when the app first
  started — those env values win, so with the `.env.example` placeholders you sign in as
  `admin@example.com` / `replace-with-a-strong-password`. `admin@meetbeatz.com` / `meetbeatz123`
  are only used when neither variable is set. Change the password under Settings.
- The admin row is created once, on the first page load that reaches an empty database. To change
  it afterwards, update the password in Settings or delete the row from the `admins` table and
  restart with new env values.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (copy it from `.env.example` and pick your port). `POSTGRES_URL` is also read, which is the name Vercel's database integrations provide |
| `PAYSTACK_SECRET_KEY` | Enables live Paystack payments. Without it the app runs in **test mode** with a simulated MoMo prompt. |
| `NEXT_PUBLIC_APP_URL` | Public URL used in emails and the Paystack callback (auto-detected if unset) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | Email delivery via SMTP |
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
- **Admin dashboard**: revenue split overview, beat upload with real progress (cover, tagged preview, MP3, WAV, stems), license/price management, orders (resend email), bookings (confirm / complete / cancel), services & hours, license types, settings, payout subaccount creator, test email, password change.

## Where uploaded files live

Beat files (cover art, previews, masters, stems) are stored **in PostgreSQL**, in
`stored_files` + `stored_file_chunks`, and streamed back through protected API routes
(`/api/media/...`, `/api/beats/[id]/preview`, `/api/download/[token]`) with HTTP `Range`
support so buyers can pause/resume downloads and the player can seek.

This is deliberate: on a serverless host (Vercel) the deployment bundle is read-only, so the
old `mkdir('./uploads')` step failed with
`ENOENT: no such file or directory, mkdir '/var/task/uploads'` and every upload — plus the
demo previews written during seeding — failed. The database is the one durable store the app
already has, so no extra service or API keys are needed.

How it works:

- The browser asks `POST /api/admin/uploads` for a session, then sends the file in **4 MB
  parts** (`PUT /api/admin/uploads/[id]?index=n`) and finishes with `POST /api/admin/uploads/[id]`.
  Chunking is what makes large masters possible: serverless hosts reject request bodies over
  **4.5 MB**, so a single multipart WAV upload could never work there whatever the storage.
- **If an upload still fails with `413` (Request Entity Too Large)**, a proxy in front of the
  app has a smaller limit than the platform's — the app itself never sees those requests, so the
  form discovers the limit by trying: it starts at 4 MB and **halves the part size** (down to
  128 KB) until the proxy accepts it, then remembers the working size in that browser for the
  next upload. Admin → Settings → *Upload path* shows which size is in use and clears it, which
  is worth doing after a gateway's limit is raised. If even 128 KB is refused, the error says so
  instead of failing silently.
- A part is validated as it arrives (size, position) and re-sending a part overwrites it, so a
  dropped request is recoverable. Nothing is readable until the last part is in.
- Max **512 MB per file**. Storage grows with uploads — a few hundred MB of WAVs/stem zips is
  normal; abandoned uploads are cleaned up automatically (half-finished after 24 h, finished
  but never attached to a beat after 7 days).
- Files uploaded by the older disk-backed version are copied into the database the first time
  the app seeds (`./uploads` still existing is the trigger), so beats that pointed at
  `mp3/…` keep playing.

`npm run doctor` reports the upload tables and how much they hold. If a deployment ever reports
that `stored_files` does not exist, its build ran without a database connection — run
`npm run db:push` (or redeploy) and uploads work again.
