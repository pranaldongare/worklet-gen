# Worklet Generator Agent

An AI-driven research and worklet-generation platform. The application takes a research prompt, supporting files, and links — then runs a multi-stage LLM pipeline that extracts entities, searches the web, gathers academic papers and patents, synthesises a comparative state-of-the-art analysis, identifies gaps, and produces forward-looking problem statements with detailed proposal-quality write-ups.

The codebase is split into:

- **Backend** — FastAPI + Socket.IO + MongoDB + LangChain pipelines (Python 3.11)
- **Frontend** — Vite + React 18 + TypeScript + Tailwind + shadcn/ui (Node 22)
- **LLM** — Local Ollama (preferred) with automatic fallback to Gemini and OpenAI
- **Storage** — MongoDB for documents, local filesystem for uploaded files

---

## Table of Contents

1. [Architecture overview](#architecture-overview)
2. [What you need before starting](#what-you-need-before-starting)
3. [Setup on Ubuntu](#setup-on-ubuntu-2204--later)
4. [Setup on Windows](#setup-on-windows-1011)
5. [Running the application](#running-the-application)
6. [Environment variables reference](#environment-variables-reference)
7. [Updating the project](#updating-the-project)
8. [Troubleshooting](#troubleshooting)

---

## Architecture overview

```
┌─────────────────────┐       HTTP/WebSocket       ┌──────────────────────┐
│  Frontend (Vite)    │ ◄────────────────────────► │  Backend (FastAPI)   │
│  http://localhost:  │                            │  http://localhost:   │
│  5173               │                            │  8000                │
└─────────────────────┘                            └──────────┬───────────┘
                                                              │
                                  ┌───────────────────────────┼───────────────────────────┐
                                  ▼                           ▼                           ▼
                         ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
                         │  MongoDB        │         │  Ollama (local) │         │  Tavily / DDGS  │
                         │  localhost:     │         │  localhost:     │         │  Google Scholar │
                         │  27017          │         │  11434 / 11435  │         │  Google Patents │
                         └─────────────────┘         └─────────────────┘         └─────────────────┘
                                                              │
                                                              ▼ (fallback)
                                                     ┌─────────────────┐
                                                     │  Gemini API     │
                                                     │  OpenAI API     │
                                                     └─────────────────┘
```

The backend orchestrates a multi-stage research pipeline. If the local Ollama GPU server is unreachable, the LLM client transparently falls back to Gemini (5 rotating API keys) and finally OpenAI.

---

## What you need before starting

Regardless of OS, you must have:

| Component | Version | Purpose |
|-----------|---------|---------|
| Python | 3.11 (exact) | Backend runtime. 3.12 may work but 3.11 is what the project is tested against. |
| Node.js | 22.x LTS | Frontend tooling (Vite, npm). |
| MongoDB | 6.0+ (8.x recommended) | Document database. |
| Tesseract OCR | 5.x | Used to extract text from images / scanned PDFs. |
| Git | any recent | Cloning the repo. |
| Ollama (optional) | latest | Local LLM inference. If absent, the app falls back to Gemini/OpenAI. |

You will also need API keys for the cloud fallbacks. The repo ships an `.env.example` populated with shared keys for development — copy it to `.env` and you will be able to run end-to-end.

---

## Setup on Ubuntu (22.04 / later)

All commands assume a fresh shell at your home directory.

### 1. System packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  build-essential curl wget git \
  software-properties-common ca-certificates \
  tesseract-ocr libtesseract-dev \
  libgl1 libglib2.0-0 \
  libreoffice                          # used by some doc parsers
```

`libgl1` and `libglib2.0-0` are needed by the OpenCV / image-processing dependencies that PyMuPDF and OCR pull in.

### 2. Python 3.11

Ubuntu 22.04 ships with 3.10. Install 3.11 from the deadsnakes PPA:

```bash
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3.11-dev
python3.11 --version       # should print Python 3.11.x
```

### 3. Node.js 22

Use NodeSource's official setup script:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v          # should print v22.x
npm -v           # should print 10.x or higher
```

### 4. MongoDB

Install MongoDB 8 from the official repository:

```bash
# Import the MongoDB GPG key
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor

# Add the MongoDB repo (replace 'jammy' with your codename if not 22.04)
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/8.0 multiverse" \
  | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list

sudo apt update
sudo apt install -y mongodb-org

# Start it now and on every boot
sudo systemctl enable --now mongod
sudo systemctl status mongod         # confirm 'active (running)'
```

Verify the connection:

```bash
mongosh --eval "db.runCommand({ ping: 1 })"
```

You should see `{ ok: 1 }`.

### 5. (Optional) Ollama for local LLM

If you have a GPU and want to avoid hitting cloud quotas, install Ollama:

```bash
curl -fsSL https://ollama.com/install.sh | sh

# Pull the model used by the project (large; ~13 GB)
ollama pull gpt-oss:20b-50k-8k

# Run two instances on the ports the backend expects
OLLAMA_HOST=0.0.0.0:11434 ollama serve &
OLLAMA_HOST=0.0.0.0:11435 ollama serve &
```

If you skip this, the backend will log "GPU server failed" at every call and immediately fall back to Gemini/OpenAI — that's fine, just slower.

### 6. Clone the repository

```bash
cd ~
git clone https://github.com/pranaldongare/worklet-gen.git
cd worklet-gen
```

### 7. Backend setup

```bash
# Create and activate a virtualenv
python3.11 -m venv virtualEnv
source virtualEnv/bin/activate

# Upgrade pip and install dependencies
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Open .env and review/replace API keys as needed
```

### 8. Frontend setup

```bash
cd frontend
cp .env.example .env          # only needed if you want Google Drive picker
npm install
cd ..
```

`npm install` will take a few minutes the first time.

### 9. First-run smoke test

```bash
# Terminal 1 — backend
source virtualEnv/bin/activate
python backend.py

# Terminal 2 — frontend
cd frontend
npm run dev
```

Open `http://localhost:5173` in a browser. You should see the home page.

---

## Setup on Windows (10/11)

All commands assume PowerShell unless otherwise noted. Open PowerShell as **Administrator** for the install steps; you can drop back to a regular PowerShell window once everything is installed.

### 1. Python 3.11

Download and run the installer:

> https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe

When the installer launches:

1. **Tick "Add python.exe to PATH"** at the bottom of the first screen.
2. Click **Customize installation**, then **Next** through the optional features (leave them all checked), and on the next page tick **Install for all users** if you want a system-wide install.
3. Click **Install**.

Verify:

```powershell
python --version          # should print Python 3.11.9
pip --version
```

If `python` is not recognised, restart PowerShell (or sign out and back in) so the PATH change takes effect.

### 2. Node.js 22

Download and run the installer:

> https://nodejs.org/dist/v22.20.0/node-v22.20.0-x64.msi

During install:

1. Accept the license.
2. Keep the default install folder.
3. On the **Custom Setup** screen leave everything checked (npm package manager, Add to PATH, etc.).
4. **Skip** the optional "Tools for Native Modules" page unless you specifically need it — it pulls in Chocolatey and Visual Studio Build Tools, which aren't required for this project.

Verify:

```powershell
node -v          # v22.x
npm -v           # 10.x or higher
```

### 3. MongoDB

Download and run the MSI:

> https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.2.1-signed.msi

During install:

1. Choose **Complete** (not Custom).
2. On the "Service Configuration" page leave **Install MongoDB as a Service** ticked. Service name: `MongoDB`, run as Network Service.
3. Leave **Install MongoDB Compass** ticked — it's the GUI you'll use to inspect data.
4. Finish the installer.

Verify the service is running:

```powershell
Get-Service MongoDB
# Status should be 'Running'
```

If it's `Stopped`, start it manually:

```powershell
Start-Service MongoDB
```

Optional sanity check via `mongosh` (auto-installed):

```powershell
mongosh --eval "db.runCommand({ ping: 1 })"
```

### 4. Tesseract OCR

Download and run the installer:

> https://github.com/UB-Mannheim/tesseract/releases/download/v5.4.0.20240606/tesseract-ocr-w64-setup-5.4.0.20240606.exe

Default install path is `C:\Program Files\Tesseract-OCR`. Add this folder to your **system PATH**:

1. Press `Win` and search **Environment Variables** → **Edit the system environment variables**.
2. Click **Environment Variables…** → under **System variables** find `Path` → **Edit** → **New** → paste `C:\Program Files\Tesseract-OCR`.
3. OK out, then restart PowerShell.

Verify:

```powershell
tesseract --version
```

### 5. Git

Install Git for Windows:

> https://git-scm.com/download/win

Accept the defaults. Verify:

```powershell
git --version
```

### 6. (Optional) Ollama for local LLM

> https://ollama.com/download/OllamaSetup.exe

After install:

```powershell
ollama pull gpt-oss:20b-50k-8k

# Ollama auto-starts on port 11434 as a system service.
# To run a second instance on 11435 (the backend's alternate port), open PowerShell:
$env:OLLAMA_HOST="0.0.0.0:11435"
ollama serve
```

Skip this step if you don't have a GPU — the app will fall back to Gemini/OpenAI automatically.

### 7. Clone the repository

```powershell
cd $HOME
git clone https://github.com/pranaldongare/worklet-gen.git
cd worklet-gen
```

### 8. Backend setup

```powershell
# Create and activate the virtualenv
python -m venv virtualEnv
.\virtualEnv\Scripts\Activate.ps1

# If activation is blocked by execution policy, run this once (admin):
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

# Upgrade pip and install dependencies
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt

# Configure environment variables
Copy-Item .env.example .env
# Open .env in your editor and review/replace API keys as needed
```

If `pip install` fails on a package that needs C compilation, install the **Microsoft C++ Build Tools** from <https://visualstudio.microsoft.com/visual-cpp-build-tools/> (workload: "Desktop development with C++"), then retry.

### 9. Frontend setup

```powershell
cd frontend
Copy-Item .env.example .env       # only needed if you want Google Drive picker
npm install
cd ..
```

### 10. First-run smoke test

Open two PowerShell windows.

**Window 1 — backend:**

```powershell
cd $HOME\worklet-gen
.\virtualEnv\Scripts\Activate.ps1
python backend.py
```

Wait for `Application startup complete` and `Uvicorn running on http://0.0.0.0:8000`.

**Window 2 — frontend:**

```powershell
cd $HOME\worklet-gen\frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Running the application

After initial setup, daily use looks like this:

### Start the backend

**Ubuntu:**
```bash
cd ~/worklet-gen
source virtualEnv/bin/activate
python backend.py
```

**Windows:**
```powershell
cd $HOME\worklet-gen
.\virtualEnv\Scripts\Activate.ps1
python backend.py
```

The backend listens on **`http://localhost:8000`**. Interactive API docs are at `http://localhost:8000/docs`.

### Start the frontend

In a separate terminal:

```bash
cd worklet-gen/frontend
npm run dev
```

The frontend dev server listens on **`http://localhost:5173`** with hot module reload.

Alternatively, the project ships a helper that runs `npm install && npm run dev` for you:

```bash
python frontend.py
```

### Verify both are healthy

```bash
curl http://localhost:8000/docs        # 200
curl http://localhost:5173             # 200
```

### Stopping services

Press `Ctrl+C` in each terminal. MongoDB keeps running as a service — leave it that way.

---

## Environment variables reference

### Backend (`.env` at the repo root)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | MongoDB connection string. Default: `mongodb://localhost:27017`. |
| `DATABASE_NAME` | Mongo database name. Default: `bedrock`. |
| `SECRET_KEY` | Symmetric secret used by the app for signing. Replace before any non-local deployment. |
| `API_KEY_1` … `API_KEY_5` | Google Gemini API keys. The LLM client rotates through them on rate-limit / suspension. |
| `TAVILY_API_KEY` | Tavily web search API key. Falls back to DuckDuckGo (DDGS) if Tavily fails. |
| `OPENAI_API` | OpenAI API key. Final fallback after Gemini. |
| `QUERY_URL` | Remote GPU LLM endpoint (only used when `REMOTE_GPU=True`). |
| `REMOTE_GPU` | `True` to send LLM calls to `QUERY_URL` instead of local Ollama. |
| `USE_VISION_MODEL` | `True` to enable image / vision model paths. |
| `VISION_URL` | Remote vision-model endpoint. |
| `OLLAMA_MODEL` | Ollama text model. Default: `gpt-oss:20b-50k-8k`. |
| `OLLAMA_IMAGE_MODEL` | Ollama image model. Default: `gemma3:12b`. |
| `OLLAMA_PORT1` / `OLLAMA_PORT2` | Two ports the backend will try in order. Defaults: 11434, 11435. |
| `OLLAMA_MAX_TOKENS` | Max output tokens. Default: 50000. |
| `FALLBACK_GEMINI_MODEL` | Gemini model used as fallback. Default: `gemini-2.0-flash`. |
| `FALLBACK_OPENAI_MODEL` | OpenAI model used as final fallback. Default: `gpt-4o-mini`. |
| `DISABLE_THINKING` | `True` to disable LLM reasoning/thinking mode for faster inference. |

### Frontend (`frontend/.env`)

| Variable | Purpose |
|----------|---------|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID for the Drive Picker. Leave blank to disable the Drive integration. |
| `VITE_GOOGLE_API_KEY` | Google API key for the Drive Picker. |

---

## Updating the project

When pulling new commits:

```bash
git pull
```

If `requirements.txt` changed:

```bash
source virtualEnv/bin/activate     # or .\virtualEnv\Scripts\Activate.ps1 on Windows
pip install -r requirements.txt
```

If `frontend/package.json` changed:

```bash
cd frontend
npm install
```

Restart the backend and frontend.

---

## Troubleshooting

### `pymongo.errors.ServerSelectionTimeoutError: localhost:27017`

MongoDB isn't running.

- **Ubuntu**: `sudo systemctl start mongod`
- **Windows**: `Start-Service MongoDB`

### `ImportError: ... pymupdf` or other native extension fails on `pip install`

You're missing a system C/C++ compiler.

- **Ubuntu**: `sudo apt install build-essential python3.11-dev`
- **Windows**: install **Microsoft C++ Build Tools** (https://visualstudio.microsoft.com/visual-cpp-build-tools/), workload "Desktop development with C++".

### `tesseract is not installed or it's not in your PATH`

Tesseract isn't on PATH.

- **Ubuntu**: `sudo apt install tesseract-ocr`
- **Windows**: confirm `C:\Program Files\Tesseract-OCR` is in your system PATH (see step 4 above), then restart your terminal.

### Backend logs `GPU server failed at port 11435/11434`

Ollama isn't running. This is non-fatal — the backend will fall back to Gemini and OpenAI. To run locally:

- **Ubuntu**: `OLLAMA_HOST=0.0.0.0:11434 ollama serve &`
- **Windows**: Ollama runs as a service on 11434 by default; just confirm with `Get-Service | Where-Object Name -like "*ollama*"`.

### Frontend shows CORS error on a long-running endpoint

The backend is unresponsive (likely stuck in an LLM retry loop). The browser interprets a missing response as CORS. Restart the backend.

### Gemini errors `429 RESOURCE_EXHAUSTED` or `403 PERMISSION_DENIED`

The shared API keys in `.env.example` are dev keys and may be rate-limited or suspended. Replace them with your own (https://aistudio.google.com/apikey). The pipeline will continue with whichever keys still work, then fall back to OpenAI.

### `npm run dev` fails with `EADDRINUSE :::5173`

Port 5173 is already in use. Either kill the existing process:

- **Ubuntu**: `lsof -i :5173` then `kill <PID>`
- **Windows**: `Get-NetTCPConnection -LocalPort 5173 | Select-Object OwningProcess` then `Stop-Process -Id <PID>`

Or run on a different port: `npm run dev -- --port 5174`.

### PowerShell: "running scripts is disabled on this system"

Your execution policy blocks the venv activation script. Allow signed user scripts:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### Long import times or first request hangs

The first LLM call has to load the Ollama model into VRAM. Subsequent calls are fast. If you don't have a GPU, set `REMOTE_GPU=True` and point `QUERY_URL` at a remote inference server, or simply let the Gemini/OpenAI fallback handle it.
