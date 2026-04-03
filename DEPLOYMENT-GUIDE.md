# PTCF Reservation System - Deployment Guide

## Overview
This guide will help you deploy the PTCF Reservation System to get a live Vercel URL.

**Architecture:**
- Frontend (React + Vite) → Vercel
- Backend (Node.js + Express + PostgreSQL) → Needs separate deployment

---

## Option 1: Deploy Frontend to Vercel (Quick Demo)

This option deploys only the frontend. The backend will need to be deployed separately or kept running locally for testing.

### Prerequisites
1. GitHub account
2. Vercel account (free tier available at https://vercel.com)
3. Git installed on your machine

### Step 1: Push Your Code to GitHub

```bash
# Navigate to your project root
cd "c:\BSCS\SP\SP2\PTCF Project"

# Initialize git if not already done
git init

# Add all files
git add .

# Commit your changes
git commit -m "Milestone 5: Equipment and Room listing pages complete"

# Create a new repository on GitHub (https://github.com/new)
# Then link it to your local repository
git remote add origin https://github.com/YOUR_USERNAME/ptcf-reservation.git

# Push to GitHub
git push -u origin main
```

### Step 2: Deploy Frontend to Vercel

1. **Go to Vercel:** https://vercel.com
2. **Sign up/Login** with your GitHub account
3. **Click "Add New Project"**
4. **Import your GitHub repository** (ptcf-reservation)
5. **Configure Project:**
   - Framework Preset: **Vite**
   - Root Directory: **client**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

6. **Add Environment Variable:**
   - Key: `VITE_API_URL`
   - Value: `http://localhost:4000/api` (temporary, will update after backend deployment)

7. **Click "Deploy"**

8. **Wait for deployment** (usually 1-2 minutes)

9. **Get your live URL:** `https://your-project-name.vercel.app`

### Step 3: Test Your Deployment

⚠️ **Important:** The frontend will be live, but it will try to connect to `localhost:4000` which won't work in production. You'll need to deploy the backend next.

---

## Option 2: Full Stack Deployment (Recommended for Production)

### Backend Deployment Options

#### Option A: Deploy Backend to Railway (Recommended)

**Railway** provides free PostgreSQL database and Node.js hosting.

1. **Go to Railway:** https://railway.app
2. **Sign up** with GitHub
3. **Create New Project** → **Deploy from GitHub repo**
4. **Select your repository**
5. **Add PostgreSQL database:**
   - Click "New" → "Database" → "PostgreSQL"
   - Railway will automatically create a database
6. **Configure Backend Service:**
   - Root Directory: `server`
   - Start Command: `npm start`
   - Add environment variables from your `.env` file:
     - `DATABASE_URL` (automatically provided by Railway)
     - `JWT_SECRET`
     - `CLOUDINARY_CLOUD_NAME`
     - `CLOUDINARY_API_KEY`
     - `CLOUDINARY_API_SECRET`
     - `SENDGRID_API_KEY`
     - `SENDGRID_FROM_EMAIL`
7. **Deploy**
8. **Get your backend URL:** `https://your-backend.railway.app`

#### Option B: Deploy Backend to Render

1. **Go to Render:** https://render.com
2. **Sign up** with GitHub
3. **Create New Web Service**
4. **Connect your GitHub repository**
5. **Configure:**
   - Name: `ptcf-backend`
   - Root Directory: `server`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Add environment variables
6. **Create PostgreSQL database** (separate service)
7. **Deploy**

### Step 4: Update Frontend Environment Variable

After deploying your backend:

1. **Go to Vercel Dashboard**
2. **Select your project**
3. **Settings** → **Environment Variables**
4. **Update `VITE_API_URL`:**
   - Value: `https://your-backend.railway.app/api` (or your Render URL)
5. **Redeploy** your frontend (Deployments → click "..." → Redeploy)

---

## Option 3: Deploy Everything to Vercel (Advanced)

Vercel supports serverless functions, but your current Express app needs restructuring.

**Not recommended for this project** due to:
- PostgreSQL database needs external hosting
- Complex Express routing
- File upload handling

---

## Testing Your Live Deployment

Once both frontend and backend are deployed:

1. **Visit your Vercel URL:** `https://your-project-name.vercel.app`
2. **Test public pages:**
   - Equipment listing (should work without login)
   - Room listing (should work without login)
3. **Test authentication:**
   - Login with: `staff@uplb.edu.ph` / `staff123`
   - Try creating/editing equipment or rooms
4. **Test protected pages:**
   - Equipment detail pages
   - Room detail pages

---

## Troubleshooting

### CORS Issues
If you get CORS errors, update your backend's CORS configuration:

```javascript
// server/index.js
app.use(cors({
  origin: 'https://your-project-name.vercel.app',
  credentials: true
}));
```

### Database Connection Issues
- Ensure `DATABASE_URL` is correctly set in Railway/Render
- Check that your database allows external connections
- Verify SSL settings if required

### Environment Variables Not Working
- Vercel env vars must start with `VITE_` to be accessible in frontend
- Redeploy after changing environment variables
- Check Vercel deployment logs for errors

---

## Quick Start (For Demo/Testing)

**Fastest way to get a live URL:**

1. **Keep backend running locally**
2. **Deploy frontend to Vercel** (Steps 1-2 above)
3. **Use ngrok to expose local backend:**
   ```bash
   # Install ngrok: https://ngrok.com/download
   ngrok http 4000
   ```
4. **Update Vercel env variable:**
   - `VITE_API_URL` = `https://your-ngrok-url.ngrok.io/api`
5. **Redeploy frontend**

⚠️ **Note:** ngrok URLs change on restart, so this is only for temporary demos.

---

## Recommended Deployment Strategy

For your **first progress update to PTCF:**

1. ✅ **Deploy frontend to Vercel** (5 minutes)
2. ✅ **Deploy backend to Railway** (10 minutes)
3. ✅ **Update frontend env vars** (2 minutes)
4. ✅ **Test everything** (5 minutes)
5. ✅ **Share Vercel URL with PTCF**

**Total time:** ~25 minutes

---

## Next Steps After Deployment

1. **Share your live URL** with PTCF contact
2. **Request real data** (photos and names for rooms and equipment)
3. **Monitor Vercel Analytics** for usage
4. **Check Railway/Render logs** for backend errors
5. **Set up custom domain** (optional, if PTCF provides one)

---

## Support Resources

- **Vercel Docs:** https://vercel.com/docs
- **Railway Docs:** https://docs.railway.app
- **Render Docs:** https://render.com/docs
- **Vite Deployment:** https://vitejs.dev/guide/static-deploy.html

---

## Files Modified for Deployment

- ✅ `client/vercel.json` - Vercel routing configuration
- ✅ `client/.env.example` - Environment variable template
- ✅ `client/src/lib/axios.js` - Dynamic API URL
- ✅ `client/src/lib/imageUpload.js` - Dynamic API URL

All changes are backward compatible with local development!
