# 🌐 CareNest Production Deployment & Hosting Guide

This guide contains step-by-step instructions to deploy and host the CareNest home care platform to standard production cloud environments.

---

## 🛠️ Production Readiness Updates Made
The codebase is now pre-configured for instant zero-config cloud hosting:
1. **Dynamic Backend Routing**: All API requests (`fetch` and WebSockets) dynamically resolve to `window.location.origin` in production, eliminating hardcoded `http://localhost:5000` URLs.
2. **Unified Node Host**: Express (`server/server.js`) is configured to serve the built React files (`dist/`) directly, meaning you only need to run **one service** to host the entire web app.
3. **Flexible Database Adaptability**: The database pool automatically checks for `DATABASE_URL` and enables production-required SSL authorization (standard for managed clouds).

---

## 🚀 Option A: Hosting on Render.com (Recommended & Easiest)
Render offers a free tier for hosting fullstack Node applications and managed PostgreSQL databases.

### Step 1: Create a PostgreSQL Database
1. Sign in to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New** ➔ **PostgreSQL**.
3. Set your Database Details:
   * **Name**: `carenest-db`
   * **Database**: `carenest`
   * **User**: `postgres`
4. Click **Create Database**.
5. Once created, copy the **Internal Database URL** (for backend services on Render) or **External Database URL**.

### Step 2: Deploy the Web Service
1. Push your CareNest code repository to a GitHub/GitLab account.
2. In the Render Dashboard, click **New** ➔ **Web Service**.
3. Connect your CareNest code repository.
4. Set the service properties:
   * **Name**: `carenest-app`
   * **Environment**: `Node`
   * **Build Command**: `npm install && npm run build` (This installs packages and compiles the React distribution).
   * **Start Command**: `node server/server.js`
5. Under **Environment Variables**, add the following keys:
   * `NODE_ENV` = `production`
   * `PORT` = `10000` (Render binds the port automatically, but this ensures fallback alignment)
   * `DATABASE_URL` = *[Paste the Connection URL you copied in Step 1]*
6. Click **Deploy Web Service**. Render will build and launch your fullstack application. Your app will be live at `https://carenest-app.onrender.com`.

---

## 🚂 Option B: Hosting on Railway.app
Railway is extremely fast and provisions databases with one click.

1. Sign in to [Railway.app](https://railway.app/).
2. Click **New Project** ➔ **Provision PostgreSQL**.
3. Once the database is ready, click **New** ➔ **GitHub Repo** and connect your CareNest repository.
4. Go to the service **Variables** tab and click **Reference Variable**. Select the database variables to automatically inject the correct connection string:
   * Add `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   * Add `NODE_ENV` = `production`
5. Railway will automatically detect Node, install dependencies, compile Vite, and start the Express server.

---

## 🖥️ Option C: Hosting on a VPS (DigitalOcean / AWS EC2 / Linode)
For self-hosting on a dedicated Ubuntu Linux Virtual Private Server.

### Step 1: Server Setup
SSH into your server and install Node.js, Git, and PostgreSQL:
```bash
sudo apt update
sudo apt install -y nodejs npm git postgresql postgresql-contrib
```

### Step 2: Clone and Build
Clone your repository and compile the build artifacts:
```bash
git clone <your-repo-url> /var/www/carenest
cd /var/www/carenest
npm install
npm run build
```

### Step 3: Run with PM2 (Process Manager)
Keep the Express server running forever in the background:
```bash
# Install PM2 globally
sudo npm install -p pm2 -g

# Start the server with variables
DATABASE_URL="postgresql://postgres:password@localhost:5432/carenest" NODE_ENV=production pm2 start server/server.js --name carenest-app

# Configure PM2 to start on system boot
pm2 startup
pm2 save
```

### Step 4: Configure Nginx Reverse Proxy
To point custom domains (e.g. `carenest.yourdomain.com`) to the Node port:
1. Install Nginx:
   ```bash
   sudo apt install nginx
   ```
2. Create Nginx config block `/etc/nginx/sites-available/carenest`:
   ```nginx
   server {
       listen 80;
       server_name carenest.yourdomain.com;

       location / {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
3. Enable configuration and restart Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/carenest /etc/nginx/sites-enabled/
   sudo systemctl restart nginx
   ```
