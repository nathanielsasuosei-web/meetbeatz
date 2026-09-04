# Meetbeatz Deployment to Vercel + Railway

Your code is ready for deployment! Follow these steps exactly.

---

## Step 1: Create GitHub Repository (5 minutes)

1. Go to https://github.com/new
2. Enter:
   - Repository name: `meetbeatz`
   - Description: `Premium beats & studio sessions with Mobile Money payments`
   - Select "Public"
   - Click "Create repository"

3. You'll see a page like this. Copy-paste **these exact commands** into your terminal:

```powershell
git branch -M main
git remote add origin https://github.com/nathanielsasuosei/meetbeatz.git
git push -u origin main
```

Your code is now on GitHub at: https://github.com/nathanielsasuosei/meetbeatz

---

## Step 2: Create Railway PostgreSQL Database (3 minutes)

1. Go to https://railway.app
2. Click "Start New Project"
3. Select "Provision PostgreSQL"
4. Wait for it to complete
5. Click on the PostgreSQL box
6. Click "Connect" tab
7. Copy the full connection string (looks like: `postgresql://user:password@...`)
8. **Save it somewhere safe** - you'll need it in Step 3

---

## Step 3: Deploy to Vercel (5 minutes)

1. Go to https://vercel.com
2. Click "Sign up" → "Continue with GitHub"
3. Authorize Vercel to access your GitHub
4. After login, click "Add New..." → "Project"
5. Find and click "meetbeatz" repository
6. Framework: **Next.js** (auto-selected)
7. Root Directory: (leave empty)
8. Build Command: (leave as default)
9. Click "Deploy"

**Wait for the first deploy to complete (takes ~2 min)**

---

## Step 4: Add Environment Variables to Vercel (2 minutes)

1. After deployment completes, go to Settings → Environment Variables
2. Add these variables one by one:

**Database:**
```
DATABASE_URL = [Paste the Railway connection string from Step 2]
```

**Email (Gmail):**
```
SMTP_HOST = smtp.gmail.com
SMTP_PORT = 587
SMTP_USER = 2.nathanielsasuosei@gmail.com
SMTP_PASS = bqjr awse pdvl ukdp
SMTP_SECURE = false
EMAIL_FROM = Meetbeatz <2.nathanielsasuosei@gmail.com>
```

**Admin Account:**
```
ADMIN_EMAIL = meetbeatz@gmail.com
ADMIN_PASSWORD = Qwerty2266
```

**Security & URLs:**
```
SESSION_SECRET = your-random-32-character-secret-string-here
NEXT_PUBLIC_APP_URL = https://meetbeatz.com
```

**For now (test mode - real Paystack later):**
```
PAYMENT_MODE = simulation
```

3. After adding each variable, click "Save"
4. Click "Redeploy" to apply all variables

---

## Step 5: Set Up Custom Domain (2 minutes)

1. In Vercel dashboard, go to Settings → Domains
2. Enter: `meetbeatz.com`
3. You'll see nameserver instructions
4. Go to your domain registrar (where you bought meetbeatz.com)
5. Update DNS nameservers to Vercel's (exact instructions shown in Vercel)
6. Wait 5-15 minutes for DNS to propagate
7. Check Vercel dashboard - domain will show ✓ when ready

---

## Step 6: Test Your Deployment

1. Visit https://meetbeatz.com (or your Vercel auto-domain if not ready)
2. Click "Admin" at the bottom, or go to /admin/login
3. Login with:
   - Email: `meetbeatz@gmail.com`
   - Password: `Qwerty2266`
4. Go to Settings and verify:
   - Paystack key shows: "missing (simulation mode)"
   - Email shows: "SMTP"
   - Split shows: "not set" (okay for now)

---

## Next Steps (When Ready for Real Payments)

1. **Get Paystack Live Key:**
   - Go to https://dashboard.paystack.co/settings/developer
   - Copy your **Live Secret Key** (starts with `sk_live_`)

2. **Add to Vercel:**
   - Settings → Environment Variables
   - Add: `PAYSTACK_SECRET_KEY = sk_live_your_key_here`
   - Redeploy

3. **Set Up Payout Subaccount:**
   - Login to your admin dashboard
   - Go to Settings → Create payout subaccount
   - Choose Mobile Money or Bank account
   - Fill in Meetbeatz's payment details
   - Click "Create payout subaccount"
   - It auto-saves

4. **Upload Your First Beat:**
   - Go to Admin → Beats → Upload beat
   - Upload cover, preview, MP3, WAV
   - Set license prices
   - Publish

---

## If Something Goes Wrong

**Database error on first load?**
- Go to Vercel Logs (Deployments → View Build Logs)
- Check if DATABASE_URL is correct

**Email not sending?**
- Verify Gmail app password is correct in Vercel
- Check SMTP_HOST = `smtp.gmail.com` (exact spelling)

**Login not working?**
- Verify ADMIN_EMAIL and ADMIN_PASSWORD exactly match what you set
- Make sure SESSION_SECRET is set

---

## Commands You Need to Run

Copy and paste this into PowerShell in your project folder:

```powershell
git branch -M main
git remote add origin https://github.com/nathanielsasuosei/meetbeatz.git
git push -u origin main
```

That's it! Then follow the steps above.

---

## Support

- Vercel docs: https://vercel.com/docs/nextjs
- Railway docs: https://docs.railway.app
- Paystack docs: https://paystack.com/docs/api/
- Resend email: https://resend.com/docs (if you want to use Resend instead of Gmail later)
