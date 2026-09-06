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

> **Important:** Vercel's local filesystem is ephemeral. Before enabling admin uploads in production, move `uploads/` to durable object storage such as Cloudinary, S3, or UploadThing and store the resulting URLs in the database. The current local-disk upload implementation is suitable for local development and a persistent VPS, but not for reliable Vercel production use.

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
