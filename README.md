# Lesestunde — German Reading Studio

AI-powered German vocabulary practice. Add words, generate level-appropriate reading passages (A1–C2), and look up definitions in context. Everything syncs to your account via Supabase.

## Stack

- **Frontend:** Vite (vanilla JS, no framework)
- **Auth:** Supabase Auth with Google OAuth
- **Database:** Supabase Postgres (words, texts, api_settings)
- **AI:** Any OpenAI-compatible API — Gemini, OpenAI, OpenRouter, or local (Ollama, LM Studio, etc.)
- **Hosting:** GitHub Pages (via GitHub Actions)

---

## Local Development

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/lesestunde
cd lesestunde
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Copy your **Project URL** and **anon key** from Project Settings → API

### 3. Run the migration

In the Supabase dashboard, go to **SQL Editor** and paste the contents of:
```
supabase/migrations/20240101000000_initial_schema.sql
```
Or with the Supabase CLI:
```bash
supabase db push
```

### 4. Enable Google OAuth

In Supabase Dashboard → **Authentication** → **Providers** → **Google**:
1. Enable Google provider
2. Add your Google OAuth credentials (create at [console.cloud.google.com](https://console.cloud.google.com))
3. Set the **Redirect URL** shown by Supabase in your Google OAuth app's Authorized redirect URIs

### 5. Set environment variables

```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 6. Run

```bash
npm run dev
# → http://localhost:5173
```

---

## Deploy to GitHub Pages

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/lesestunde.git
git push -u origin main
```

### 2. Add GitHub Secrets

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret name            | Value                                      |
|------------------------|--------------------------------------------|
| `VITE_SUPABASE_URL`    | `https://your-project-ref.supabase.co`     |
| `VITE_SUPABASE_ANON_KEY` | your anon key                            |

### 3. Enable GitHub Pages

Repo → **Settings** → **Pages** → Source: **GitHub Actions**

### 4. Update Supabase Auth redirect URLs

In Supabase → Authentication → URL Configuration, add:
```
https://YOUR_USERNAME.github.io/lesestunde
https://YOUR_USERNAME.github.io/lesestunde/
```

Push any commit to `main` — GitHub Actions will build and deploy automatically.
Your app will be live at `https://YOUR_USERNAME.github.io/lesestunde`

---

## Using Local Models

In the app's **⚙ API Key** settings, select the **Local Model** tab. Quick-fill presets are available for:

| Server     | Default URL                       | CORS setup needed              |
|------------|-----------------------------------|--------------------------------|
| Ollama     | `http://localhost:11434/v1`       | `OLLAMA_ORIGINS=*` env var     |
| LM Studio  | `http://localhost:1234/v1`        | Toggle in Server settings      |
| llama.cpp  | `http://localhost:8080/v1`        | Pass `--cors-allow-origins '*'`|
| vLLM       | `http://localhost:8000/v1`        | `--allowed-origins '*'`        |

The API key field is optional for local servers.

---

## Database Schema

| Table           | Description                                      |
|-----------------|--------------------------------------------------|
| `profiles`      | One row per user, auto-created on signup         |
| `api_settings`  | Provider, model, base URL, API key per user      |
| `words`         | Vocabulary list with optional cached definitions |
| `texts`         | Generated reading passages (corpus)              |

All tables use Row Level Security — users can only access their own data.
