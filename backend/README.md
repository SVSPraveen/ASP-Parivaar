# ASP Parivaar - Backend Deployment Guide

This Node.js/Express service powers the dynamic functionality of the **Ajeevan Samarpan Parivaar** website:
- **Online Donations**: Razorpay order creation and payment verification.
- **Volunteer Applications**: Submitting and persisting volunteer records.
- **Contact Form**: Message submissions.
- **Admin Dashboard**: Secure management of donations, volunteers, and inquiries protected by PIN (`asp2025`).

---

## 1. Quick Start (Run Locally)

1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. The server runs at `http://localhost:5000`.
   - Health check: `http://localhost:5000/api/health`
   - Static pages will automatically detect `localhost` and communicate directly with this backend.

---

## 2. Deploy to Render.com (Recommended Free/Standard Hosting)

Since the original backend was hosted on Render (`https://asp-backend-live.onrender.com`), here is how to republish it:

1. Push this repository to GitHub (or create a new GitHub repo with the `backend/` folder).
2. Log into [Render Dashboard](https://dashboard.render.com).
3. Click **New +** -> **Web Service**.
4. Connect your GitHub repository.
5. Configure settings:
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
6. Add Environment Variables in Render:
   - `ADMIN_PIN`: `asp2025`
   - `RAZORPAY_KEY_ID`: `rzp_live_S2VewO1jmc2WbS`
   - `RAZORPAY_KEY_SECRET`: *(Your secret from Razorpay Dashboard)*
   - `NODE_ENV`: `production`
7. Click **Create Web Service**.
8. If Render assigns a new URL (e.g. `https://asp-parivaar-backend.onrender.com`), update `API_URL` in `js/config.js` with that URL.

---

## 3. Deploy to Railway or VPS

Run directly using Docker or standard PM2:
```bash
npm install -g pm2
pm2 start server.js --name "asp-backend"
```
