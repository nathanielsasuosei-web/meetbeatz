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

> **Important:** Vercel's filesystem is read-only and ephemeral, and requests are capped at 4.5 MB — so admin uploads (cover art, MP3/WAV/stems) cannot be stored on Vercel. The admin now gets a clear message explaining this instead of a failed upload, and the storefront, previews, checkout, downloads and bookings all keep working (demo-beat audio is generated on demand). For production uploads, either host on a VPS/Railway with a persistent volume (`UPLOAD_DIR=/data/uploads`) or move uploads to object storage (Cloudinary, S3, R2, UploadThing) and store the resulting URLs in the database.
>
> Uploads written to `/tmp` on Vercel survive only until the function instance is recycled — use it for the demo experience, not as storage.

## Environment Variables Needed

Copy these to Vercel dashboard (Settings → Environment Variables):

```
DATABASE_URL=postgresql://user:password@host:5432/app_db
PAYSTACK_SECRET_KEY=sk_live_your_key_here
PAYMENT_MODE=paystack
SESSION_SECRET=generate-a-random-32-char-string
ADMIN_EMAIL=meetbeatz@gmail.com
ADMIN_PASSWORD=YourSecurePassword
NEXT_PUBLIC_APP_URL=https://meetbeatz.com
EMAIL_FROM=Meetbeatz <no-reply@meetbeatz.com>

# Gmail sending (app password from myaccount.google.com/apppasswords)
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password
```

**OR any other SMTP provider:**
```
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-email@your-domain.com
SMTP_PASS=your-password
SMTP_SECURE=false
```

**OR if using Resend instead of SMTP:**
```
RESEND_API_KEY=re_your_resend_api_key
EMAIL_FROM=Meetbeatz <onboarding@resend.dev>
```

The database tables are created with `npm run db:setup` (locally) — for a hosted database run
`DATABASE_URL="postgresql://…" npx drizzle-kit push` once, or add the same command to your deploy step.

> **Secrets:** `.env` is git-ignored. Never commit it — the repository is public. If a secret has
> ever been committed, rotate it (new database password, new Gmail app password, new `SESSION_SECRET`)
> instead of only deleting the file, because it stays in the git history.

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

> `vercel.json` pins the functions to **Paris (`cdg1`)** — the closest region to Accra. Keep the database in the same area (EU) so every query does not cross the Atlantic. You can override the region in the Vercel dashboard if your database lives elsewhere; the important thing is that functions and database are near each other.

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
- [ ] Upload a test beat
- [ ] Test a payment (test mode)
- [ ] Verify email sends
- [ ] Check `/admin/settings` for warnings

If using Vercel before object storage is integrated, deploy the public storefront for review only and do not rely on production admin uploads or stored downloads.

## First Time Setup on Production

**1. Create the tables** in the hosted database (once), from your machine:

```bash
DATABASE_URL="postgresql://user:password@host:5432/app_db" npx drizzle-kit push
```

Without this step every page fails with `relation "beats" does not exist`.

**2. Then deploy.** The database auto-seeds on the first page load:
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
