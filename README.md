# AI Knowledge Base Assistant (RAG)

A lightweight, cloud-ready **Retrieval-Augmented Generation (RAG)** assistant built with **FastAPI**, **LangChain**, **Google Gemini**, **Qdrant**, and **React + Vite**.

Designed to run smoothly on low-spec laptops (zero local LLM or heavy embedding models required) and deploy cleanly to the cloud.

---

## Features

- **Multi-Format Document Ingestion**: Upload `.pdf`, `.docx`, `.txt`, `.md`, `.csv`, and `.json` files via drag-and-drop or file picker.
- **Grounded Answers with Source Citations**: Every answer includes inline `[1]`, `[2]` citations paired with expandable source cards showing the exact document name, page number, chunk index, relevance score, and verbatim excerpt.
- **History-Aware Follow-Up Questions**: Chat sessions persist in SQLite (`aiosqlite`), and LangChain rewrites follow-up questions using conversation history before querying the vector store.
- **Document Management & Scoped Search**: View indexed documents (pages, chunks, file size), filter Q&A to specific documents, and delete documents cleanly from both metadata and vector storage.
- **Cloud-Ready Vector Storage**: Defaults to embedded local disk Qdrant (`./data/qdrant_db` — zero Docker or RAM overhead locally), and seamlessly switches to **Qdrant Cloud** when `QDRANT_URL` and `QDRANT_API_KEY` are set.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide Icons, React Markdown |
| **Backend** | Python 3.12, FastAPI, Uvicorn, Pydantic v2 |
| **RAG Orchestration** | LangChain (`langchain`, `langchain-core`, `langchain-text-splitters`, `langchain-google-genai`, `langchain-qdrant`) |
| **LLM & Embeddings** | Google Gemini (`gemini-2.5-flash` + `gemini-embedding-001` via free Gemini API) |
| **Vector Database** | Qdrant (local persistent disk by default, or Qdrant Cloud Free Tier) |
| **Metadata & History DB** | SQLite (`aiosqlite`) |

---

## Local Development Setup

### 1. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit backend/.env and set GOOGLE_API_KEY=your_gemini_api_key
```

Create a Python virtual environment and install dependencies (using `uv` or `pip`):

```bash
# Using uv (recommended)
uv venv .venv --python 3.12
uv pip install --python .venv/Scripts/python.exe -r requirements.txt
.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
```

*(On macOS/Linux, activate with `source .venv/bin/activate` and run `uvicorn app.main:app --reload --port 8000`.)*

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser. Vite proxies `/api/*` requests directly to `http://127.0.0.1:8000`.

### 3. Run Backend Tests

```bash
cd backend
.venv\Scripts\python.exe -m pytest -v
```

---

## Cloud Deployment

### Option A: Docker Compose (Single Server / VPS)

```bash
export GOOGLE_API_KEY=your_gemini_api_key
docker compose up --build -d
```

- Frontend served at `http://localhost:3000`
- Backend API at `http://localhost:8000`
- Persistent data stored in Docker volume `kb_data`

### Option B: Render (Free Tier Blueprint)

This repository includes `render.yaml`:
1. Create a free [Qdrant Cloud](https://cloud.qdrant.io/) cluster (1 GB free forever) for persistent cloud vector storage.
2. Push this repo to GitHub and create a new **Blueprint** on Render pointing to the repo.
3. Set `GOOGLE_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, and `CORS_ORIGINS` (your Render static site URL) on the backend service, and `VITE_API_BASE_URL` (your Render backend URL) on the frontend static site.

### Option C: Vercel (Frontend) + Railway / Render / Cloud Run (Backend)

- Deploy `frontend/` to Vercel with `VITE_API_BASE_URL=https://your-backend-url`.
- Deploy `backend/` using `backend/Dockerfile` with `GOOGLE_API_KEY`, `CORS_ORIGINS`, and optional `QDRANT_URL` / `QDRANT_API_KEY`.

---

## API Endpoints

- `GET /api/health` — Service health & active Gemini/Qdrant config
- `GET /api/documents` — List indexed documents
- `POST /api/documents/upload` — Upload & index PDF, DOCX, TXT, MD, CSV, JSON files
- `DELETE /api/documents/{doc_id}` — Remove document and its vectors
- `GET /api/chat/sessions` — List saved chat sessions
- `POST /api/chat/sessions` — Create new chat session
- `GET /api/chat/sessions/{session_id}` — Fetch full chat history & citations
- `PATCH /api/chat/sessions/{session_id}` — Rename chat session
- `DELETE /api/chat/sessions/{session_id}` — Delete chat session
- `POST /api/chat/ask` — Ask a question with optional `session_id` and `document_ids` filter
