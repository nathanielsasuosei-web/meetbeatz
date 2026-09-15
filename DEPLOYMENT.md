# Meetbeatz Deployment Checklist

## Before Deployment

- [x] Code builds successfully locally
- [ ] GitHub account created
- [ ] GitHub repository created (public or private)
- [ ] Vercel account created
- [ ] PostgreSQL database provisioned (Railway recommended)
- [ ] Paystack account set up
- [ ] Email provider configured (Gmail, Brevo, Resend)
- [ ] Domain registered (meetbeatz.com)

> **Uploads work on Vercel as-is — no object storage needed.** Beat files (cover, preview,
> MP3, WAV, stems) are stored in PostgreSQL (`stored_files` / `stored_file_chunks`) and the
> browser sends them in **4 MB parts**, which solves the two things that used to break uploads
> there: the read-only deployment filesystem (`ENOENT: … mkdir '/var/task/uploads'`) and
> Vercel's 4.5 MB request-body limit. Nothing extra to sign up for or configure.
>
> Two consequences to keep in mind: a single file is capped at **512 MB**, and uploads count
> towards your database size (a beat with a WAV master is typically 30–60 MB, stems more). If
> the catalog ever grows into hundreds of gigabytes, *that* is when moving the bytes to
> Cloudinary/S3 becomes worth it — the storage layer is isolated in `src/lib/files.ts`.
>
> Abandoned uploads clean themselves up: half-finished sessions after 24 hours, finished files
> that no beat references after 7 days. `npm run doctor` prints how many files are stored and
> their total size.
>
> If the form ever reports **`Upload failed (413)`**, something in front of the app — a preview
> gateway, Cloudflare, nginx's 1 MB `client_max_body_size` default — refused the request body
> before it reached the app. The form halves its part size (4 MB → 2 MB → … → 128 KB) until the
> proxy accepts it and remembers that size for the next upload; Admin → Settings → *Upload path*
> shows it and clears it if a gateway's limit is later raised.

## Environment Variables Needed

Copy these to Vercel dashboard (Settings → Environment Variables):

```
DATABASE_URL=postgresql://user:password@host:5432/app_db
PAYSTACK_SECRET_KEY=sk_live_your_key_here
SESSION_SECRET=generate-a-random-32-char-string
ADMIN_EMAIL=meetbeatz@gmail.com
ADMIN_PASSWORD=YourSecurePassword
NEXT_PUBLIC_APP_URL=https://meetbeatz.com
EMAIL_FROM=Meetbeatz <no-reply@meetbeatz.com>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_SECURE=false
```

**OR if using Resend instead of SMTP:**
```
RESEND_API_KEY=re_your_resend_api_key
EMAIL_FROM=Meetbeatz <onboarding@resend.dev>
```

## Deployment Steps

### 1. Push to GitHub

```powershell
cd C:\Users\SISA\meet1
git init
git config user.name "Your Name"
git config user.email "your-email@gmail.com"
git add .
git commit -m "Initial commit: Meetbeatz beat store & studio bookings"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/meetbeatz.git
git push -u origin main
```

### 2. Set Up Vercel

1. Go to https://vercel.com
2. Sign up with GitHub
3. Click "Import Project"
4. Select your `meetbeatz` repository
5. Framework: Next.js (auto-detected)
6. Root Directory: (leave empty)
7. Build Command: `npm run build`
8. Click "Deploy"

> `npm run build` attempts a schema sync against the configured connection string first, so a
> deploy normally creates its own tables. It is **best effort**: if the sync cannot run, the build
> logs why and continues, so a deploy is never blocked by this step. Set `REQUIRE_SCHEMA_PUSH=1`
> if you would rather a failed sync stop the build. Either way the variable must exist for the
> environment Vercel builds with — a Production-only variable leaves preview deployments without
> a database, and `POSTGRES_URL` (what Vercel's own integrations provide) is read too.

### 3. Add Environment Variables in Vercel

1. After initial deploy, go to Settings → Environment Variables
2. Add each variable above
3. Redeploy (any push to main auto-redeployss)

### 4. Set Up Custom Domain

1. Settings → Domains
2. Add `meetbeatz.com`
3. Update DNS at your registrar (Vercel will show instructions)
4. Wait 5-15 minutes for SSL

### 5. Set Up Database (Railway Recommended)

1. Go to https://railway.app
2. Sign up with GitHub
3. Create new project → PostgreSQL
4. Copy `DATABASE_URL` from the database card
5. Paste into Vercel environment variables

### 6. Test Deployment

- [ ] Visit https://your-domain.com
- [ ] Login at https://your-domain.com/admin
- [ ] Upload a test beat (watch the progress bar finish, then play the preview on `/beats`)
- [ ] Test a payment (test mode)
- [ ] Verify email sends
- [ ] Check `/admin/settings` for warnings

If an upload ever reports that `stored_files` does not exist, that deployment's build ran without a
database connection, so the schema sync was skipped — run `npm run db:push` against the same
connection string (or redeploy) and uploads work again.

## If the deployed preview shows "Something went wrong"

Every page reads PostgreSQL on first load, so a deployed app with no reachable database fails
site-wide rather than showing one broken widget. Open **`https://<your-deployment>/api/health`** —
it reports which of the two causes you have:

| `reason` | Fix |
| --- | --- |
| `DATABASE_URL is not set` / `points at localhost` | Add a **hosted** PostgreSQL (Neon, Railway, Supabase) and set `DATABASE_URL` in Vercel → Project → Settings → Environment Variables. A `127.0.0.1`/`localhost` URL can never work there. |
| `tables have not been created` | Redeploy — `npm run build` now syncs the schema first. If the build log says it skipped the sync, `DATABASE_URL` is missing for that environment (Vercel scopes variables per Production/Development/Preview, and preview URLs are separate deployments). To push without redeploying, run it yourself against the same string. |

Then redeploy. `SESSION_SECRET` must also be set in Vercel, or admin login will fail.

> A `DATABASE_URL` copied from a local `.env` is the usual cause. The local `.env` is no longer
> tracked in git, so the deployment cannot inherit a `localhost` connection string by accident.

## First Time Setup on Production

After deployment, the database auto-seeds on first page load:
- Admin account created
- 3 demo beats added
- License types & studio services configured

Login with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you set.

## Go-Live Checklist

- [ ] Database configured (not local)
- [ ] Paystack secret key set (not test key)
- [ ] Email delivery working
- [ ] Custom domain active
- [ ] SSL certificate active (green padlock)
- [ ] Admin password changed from default
- [ ] All settings configured
- [ ] First beat uploaded and published
- [ ] Tested live payment flow
