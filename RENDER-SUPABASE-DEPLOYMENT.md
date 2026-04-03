# PTCF Deployment Guide - Render + Supabase + Vercel

## Architecture Overview

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Vercel    │─────▶│   Render    │─────▶│  Supabase   │
│  (Frontend) │      │  (Backend)  │      │ (PostgreSQL)│
└─────────────┘      └─────────────┘      └─────────────┘
                            ▲
                            │
                     ┌──────┴──────┐
                     │ UptimeRobot │
                     │ (Keep Awake)│
                     └─────────────┘
```

**Stack:**
- Frontend: Vercel (React + Vite)
- Backend: Render (Node.js + Express)
- Database: Supabase (PostgreSQL)
- Monitoring: UptimeRobot (prevents Render sleep)

**Total Cost:** $0/month (all free tiers)

---

## Part 1: Set Up Supabase Database (10 minutes)

### Step 1: Create Supabase Project

1. **Go to:** https://supabase.com
2. **Sign up** with GitHub
3. **Create New Project:**
   - Name: `ptcf-reservation`
   - Database Password: (generate strong password - save it!)
   - Region: `Southeast Asia (Singapore)` (closest to Philippines)
   - Pricing Plan: **Free**
4. **Wait** for project to initialize (~2 minutes)

### Step 2: Get Database Connection String

1. **Go to:** Project Settings → Database
2. **Find:** Connection String → URI
3. **Copy** the connection string (looks like):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres
   ```
4. **Replace** `[YOUR-PASSWORD]` with your actual password
5. **Save** this for later (you'll need it for Render)

### Step 3: Run Database Migrations

You have two options:

#### Option A: Use Supabase SQL Editor (Recommended)

1. **Go to:** SQL Editor in Supabase dashboard
2. **Copy your migration files** from `server/migrations/` folder
3. **Run them in order:**
   - First: `20260330000000-create-users.js` (copy the SQL part)
   - Then: `20260330000001-create-equipment.js`
   - Then: `20260330000002-create-rooms.js`
   - Finally: `20260330000003-create-reservations.js`

#### Option B: Use Sequelize CLI locally

```bash
# In your server directory
cd server

# Create .env.production file
echo "DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres" > .env.production

# Run migrations
npx sequelize-cli db:migrate --env production
```

### Step 4: Seed Initial Data (Optional)

Run your seeder to add test data:

```bash
npx sequelize-cli db:seed:all --env production
```

Or manually insert via Supabase SQL Editor.

---

## Part 2: Deploy Backend to Render (15 minutes)

### Step 1: Prepare Backend for Render

First, let's create a Render-specific configuration:

1. **Create `render.yaml`** in your project root (optional but recommended)
2. **Ensure your `server/package.json`** has the correct start script

### Step 2: Deploy to Render

1. **Go to:** https://render.com
2. **Sign up** with GitHub
3. **Click:** New → Web Service
4. **Connect** your GitHub repository
5. **Configure:**
   - **Name:** `ptcf-backend`
   - **Region:** `Singapore` (closest to Philippines)
   - **Branch:** `main`
   - **Root Directory:** `server`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`

### Step 3: Add Environment Variables

In Render dashboard, add these environment variables:

```bash
# Database (from Supabase)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres

# JWT Secret (generate a random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Cloudinary (your existing credentials)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# SendGrid (your existing credentials)
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=your-email@example.com

# Node Environment
NODE_ENV=production

# Port (Render provides this automatically, but you can set it)
PORT=4000
```

### Step 4: Deploy

1. **Click:** "Create Web Service"
2. **Wait** for deployment (~5-10 minutes)
3. **Check logs** for any errors
4. **Get your URL:** `https://ptcf-backend.onrender.com`

### Step 5: Test Backend

```bash
# Test health endpoint
curl https://ptcf-backend.onrender.com/api/health

# Should return:
# {"status":"ok","message":"PTCF server is running"}
```

---

## Part 3: Set Up UptimeRobot (5 minutes)

**Why?** Render free tier sleeps after 15 minutes of inactivity. UptimeRobot pings your server every 5 minutes to keep it awake.

### Step 1: Create UptimeRobot Account

1. **Go to:** https://uptimerobot.com
2. **Sign up** (free account)
3. **Verify** your email

### Step 2: Add Monitor

1. **Click:** "Add New Monitor"
2. **Configure:**
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** `PTCF Backend`
   - **URL:** `https://ptcf-backend.onrender.com/api/health`
   - **Monitoring Interval:** `5 minutes` (free tier)
3. **Click:** "Create Monitor"

### Step 3: Verify

- Monitor should show "Up" status
- Your Render service will now stay awake 24/7
- You'll get email alerts if your backend goes down

**Pro Tip:** Add a simple health check endpoint if you don't have one:

```javascript
// server/index.js (you already have this)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'PTCF server is running' });
});
```

---

## Part 4: Deploy Frontend to Vercel (10 minutes)

### Step 1: Push to GitHub

```bash
cd "c:\BSCS\SP\SP2\PTCF Project"

# Add all changes
git add .

# Commit
git commit -m "feat: Milestone 5 complete - Ready for deployment"

# Push to GitHub
git push origin main
```

### Step 2: Deploy to Vercel

1. **Go to:** https://vercel.com
2. **Sign in** with GitHub
3. **Click:** "Add New Project"
4. **Import** your repository
5. **Configure:**
   - **Framework Preset:** Vite
   - **Root Directory:** `client`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`

### Step 3: Add Environment Variable

**Key:** `VITE_API_URL`
**Value:** `https://ptcf-backend.onrender.com/api`

### Step 4: Deploy

1. **Click:** "Deploy"
2. **Wait** (~2-3 minutes)
3. **Get your URL:** `https://ptcf-reservation.vercel.app`

---

## Part 5: Testing Your Deployment

### Test Checklist

```bash
# 1. Test backend health
curl https://ptcf-backend.onrender.com/api/health

# 2. Test database connection
curl https://ptcf-backend.onrender.com/api/equipment

# 3. Test frontend
# Open in browser: https://ptcf-reservation.vercel.app
```

### Manual Testing

1. **Visit your Vercel URL**
2. **Test public pages:**
   - ✅ Equipment listing loads
   - ✅ Room listing loads
   - ✅ Images display correctly
3. **Test authentication:**
   - ✅ Login with: `staff@uplb.edu.ph` / `staff123`
   - ✅ Dashboard accessible
4. **Test CRUD operations:**
   - ✅ Create new equipment
   - ✅ Edit equipment
   - ✅ Delete equipment
   - ✅ Upload images
   - ✅ Remove images
5. **Test protected routes:**
   - ✅ Equipment detail page (requires auth)
   - ✅ Room detail page (requires auth)

---

## Troubleshooting

### Issue: CORS Error

**Solution:** Update your backend CORS configuration:

```javascript
// server/index.js
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://ptcf-reservation.vercel.app',
    'https://*.vercel.app' // Allow all Vercel preview deployments
  ],
  credentials: true
}));
```

Redeploy Render after making this change.

### Issue: Database Connection Failed

**Check:**
1. Supabase DATABASE_URL is correct in Render env vars
2. Password doesn't have special characters that need URL encoding
3. Supabase project is active (not paused)

**Fix:** Update DATABASE_URL in Render and redeploy.

### Issue: Images Not Uploading

**Check:**
1. Cloudinary credentials are correct in Render
2. Check Render logs for upload errors
3. Verify Cloudinary account is active

### Issue: Render Service Sleeping

**Check:**
1. UptimeRobot monitor is active
2. Monitor interval is 5 minutes
3. Health endpoint is responding

**Note:** First request after sleep may take 30-60 seconds (cold start).

### Issue: Frontend Can't Reach Backend

**Check:**
1. `VITE_API_URL` in Vercel matches your Render URL
2. Redeploy Vercel after changing env vars
3. Check browser console for CORS errors

---

## Post-Deployment Checklist

- [ ] Backend deployed to Render
- [ ] Database running on Supabase
- [ ] Frontend deployed to Vercel
- [ ] UptimeRobot monitoring active
- [ ] CORS configured correctly
- [ ] Environment variables set
- [ ] All endpoints tested
- [ ] Authentication working
- [ ] Image upload working
- [ ] CRUD operations working

---

## Monitoring & Maintenance

### Daily Checks
- Check UptimeRobot dashboard for uptime status
- Monitor Render logs for errors

### Weekly Checks
- Review Supabase database size (free tier: 500MB)
- Check Render build minutes used (free tier: 750 hours/month)
- Verify Vercel bandwidth usage (free tier: 100GB/month)

### Monthly Checks
- Review error logs
- Check for security updates
- Test all critical features

---

## Upgrade Paths (If Needed)

### If You Exceed Free Tiers:

**Render:**
- Free: 750 hours/month
- Paid: $7/month (no sleep, more resources)

**Supabase:**
- Free: 500MB database, 2GB bandwidth
- Pro: $25/month (8GB database, 50GB bandwidth)

**Vercel:**
- Free: 100GB bandwidth
- Pro: $20/month (1TB bandwidth)

**Total if all paid:** ~$52/month (unlikely for student project)

---

## Useful Commands

```bash
# View Render logs
# Go to: https://dashboard.render.com → Your Service → Logs

# Redeploy Render (after code changes)
git push origin main
# Render auto-deploys on push

# Redeploy Vercel (after env var changes)
# Go to: Vercel Dashboard → Deployments → Redeploy

# Check Supabase database
# Go to: Supabase Dashboard → Table Editor

# Force Render wake-up
curl https://ptcf-backend.onrender.com/api/health
```

---

## Support Resources

- **Render Docs:** https://render.com/docs
- **Supabase Docs:** https://supabase.com/docs
- **Vercel Docs:** https://vercel.com/docs
- **UptimeRobot Docs:** https://uptimerobot.com/help

---

## Summary

**Your deployment stack:**
- ✅ Frontend: Vercel (fast, reliable, free)
- ✅ Backend: Render (free, auto-deploy, good for Node.js)
- ✅ Database: Supabase (better than Render's PostgreSQL, free)
- ✅ Monitoring: UptimeRobot (keeps Render awake, free)

**Total setup time:** ~40 minutes
**Total cost:** $0/month
**Uptime:** ~99.9% (with UptimeRobot)

Perfect for student projects and PTCF demos! 🚀
