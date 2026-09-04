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
docker compose up -d        # start PostgreSQL (skip if you use your own Postgres — edit DATABASE_URL in .env)
npx drizzle-kit push        # create the database tables
npm run dev                 # start the site
```

Then open <http://localhost:3000>. The demo beats, license types, services and the admin account are created automatically on first load.

> Tip: `Terminal → Run Task… → Setup everything` runs the database, schema and dev-server steps for you, and `F5` starts the debugger.

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
- Default credentials: `admin@meetbeatz.com` / `meetbeatz123` (change under Settings, or set `ADMIN_EMAIL` / `ADMIN_PASSWORD` before first run).

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (already set) |
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
- **Admin dashboard**: revenue split overview, beat upload with progress (cover, tagged preview, MP3, WAV, stems), license/price management, orders (resend email), bookings (confirm / complete / cancel), services & hours, license types, settings, payout subaccount creator, test email, password change.

Uploaded files are stored in `./uploads` (outside `public/`) and streamed through protected API routes.
