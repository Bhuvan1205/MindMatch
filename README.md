# MindMatch

AI-powered cognitive compatibility matching platform.

## Stack

| Layer    | Technology                  |
|----------|-----------------------------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Backend  | FastAPI (Python)             |
| Database | PostgreSQL (Supabase)        |
| Vectors  | ChromaDB                     |
| AI       | OpenAI GPT-4o + MiniLM embeddings |

## Local Development

### Backend

```bash
cd backend
pip install -r requirements.txt
# Copy and fill in your env vars
cp ../.env.example ../.env
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
# Copy and fill in your env vars
cp .env.example .env.local
npm run dev
```

## Environment Variables

### Backend (`.env`)

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET_KEY` | Secret key for signing JWTs |
| `JWT_ALGORITHM` | JWT algorithm (default: `HS256`) |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiry (default: `10080`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins (defaults to `*` in dev) |
| `CHROMA_MODE` | `ephemeral` for in-memory ChromaDB (Render), omit for local persistent |

### Frontend (`.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API URL |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client ID |

## Deployment

- **Frontend** → [Vercel](https://vercel.com) — set `Root Directory` to `frontend`
- **Backend** → [Render](https://render.com) — uses `render.yaml`
- **Database** → [Supabase](https://supabase.com) — copy the connection string to `DATABASE_URL`
