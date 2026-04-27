# TwitchBotScanner 🔍

View-bot detection & stream authenticity analyzer.
Built with React + Vite, deployed on Vercel, powered by **Groq** (free AI API).

---

## ⚡ Setup in 10 minutes

### 1. Get your FREE Groq API key
1. Go to https://console.groq.com
2. Sign up (free, no credit card)
3. Click **API Keys** → **Create API Key**
4. Copy your key (starts with `gsk_...`)

### 2. (Optional) Get Twitch API credentials for real data
1. Go to https://dev.twitch.tv/console
2. Log in → **Register Your Application**
3. Name: anything, OAuth Redirect: `http://localhost`, Category: **Website Integration**
4. Copy **Client ID** and generate a **Client Secret**

### 3. Clone & install
```bash
git clone https://github.com/YOUR_USERNAME/twitch-botcheck
cd twitch-botcheck
npm install
```

### 4. Set up environment variables
```bash
cp .env.example .env.local
```
Edit `.env.local`:
```
GROQ_API_KEY=gsk_your_key_here
TWITCH_CLIENT_ID=your_client_id        # optional
TWITCH_CLIENT_SECRET=your_secret       # optional
```

### 5. Run locally
```bash
npm run dev
```
Open http://localhost:5173

---

## 🚀 Deploy to Vercel

### Option A — Vercel CLI (fastest)
```bash
npm install -g vercel
vercel
```
Follow the prompts. It auto-detects Vite.

### Option B — GitHub (recommended for auto-deploy)
1. Push this project to a GitHub repo
2. Go to https://vercel.com → **Add New Project**
3. Import your GitHub repo
4. Vercel auto-detects Vite settings

### Add environment variables on Vercel
In your Vercel project dashboard:
- **Settings** → **Environment Variables**
- Add `GROQ_API_KEY` (required)
- Add `TWITCH_CLIENT_ID` (optional)
- Add `TWITCH_CLIENT_SECRET` (optional)

### Add as subdomain (e.g. botcheck.indevs.in)
1. In Vercel project → **Settings** → **Domains**
2. Add `botcheck.indevs.in`
3. In your DNS provider, add:
   ```
   CNAME  botcheck  cname.vercel-dns.com
   ```

---

## 💰 Cost

| Service | Free Tier | Limit |
|---------|-----------|-------|
| Groq AI | Free | 14,400 requests/day |
| Vercel | Free | 100GB bandwidth/month |
| Twitch API | Free | Unlimited reads |

**Total cost: $0/month** up to ~14,000 scans/day.

---

## 🔧 Tech Stack
- **Frontend**: React + Vite
- **Backend**: Vercel Serverless Functions
- **AI**: Groq (llama-3.3-70b-versatile) — free
- **Live Data**: Twitch Helix API — free
- **Rate Limiting**: In-memory (upgrade to Upstash Redis for scale)
