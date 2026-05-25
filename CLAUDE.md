# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Whisper for Calls is a full-stack web application for transcribing customer service calls with speaker diarization (identifying who spoke when). It combines a Python transcription pipeline with a Node.js/React web interface.

## Architecture

### Monorepo Structure
- `apps/server/` — Express.js API server with SQLite database
- `apps/web/` — React + Vite + Tailwind frontend
- `transcribe.py` — Python CLI for transcription + speaker diarization
- Root `package.json` — npm workspaces configuration

### Transcription Pipeline (Python)
- **API mode** (default): Uses OpenAI Whisper API — requires `OPENAI_API_KEY`
- **Local mode** (`--local`): Uses local openai-whisper model — fully offline
- **Diarization**: Always local via pyannote.audio — requires `HF_TOKEN`
- **Output**: Timestamped text files with speaker labels

### Web Application (Node.js)
- **Auth**: Better Auth for authentication
- **Database**: SQLite via better-sqlite3
- **API Routes**: jobs, transcripts, admin, rubrics, batches, history
- **File Uploads**: multer for audio file handling
- **AI Integration**: OpenAI + Google Generative AI

## Essential Commands

### Development
```bash
npm install                    # Install all dependencies
npm run dev                    # Start both server and web in dev mode
npm run build                  # Build both server and web for production
npm run start                  # Start production server
```

### Python Transcription
```bash
pip install -r requirements.txt              # Install Python dependencies
python transcribe.py --file call.wav         # Transcribe single file (API mode)
python transcribe.py --dir ./calls/          # Batch transcribe directory
python transcribe.py --file call.wav --local # Local mode (offline)
python transcribe.py --file call.wav --local --whisper-model large-v3  # Better accuracy
```

### Docker
```bash
docker build -t whisper-for-calls .          # Build production image
docker run -p 3000:3000 whisper-for-calls    # Run container
```

## Environment Variables

See `.env.example`:
- `OPENAI_API_KEY` — Required for API transcription mode
- `HF_TOKEN` — Required for speaker diarization (must accept model terms on HuggingFace)

## Important Notes

- Python dependencies (torch, pyannote) are large (~1GB+ for diarization model)
- The first run of `transcribe.py` downloads the diarization model
- HuggingFace token requires accepting model terms at:
  - https://huggingface.co/pyannote/speaker-diarization-3.1
  - https://huggingface.co/pyannote/segmentation-3.0
- Dockerfile uses multi-stage build (web-builder → server-builder → production)
- The web frontend is served as static files by the Express server in production
- Audio files are stored in `apps/server/uploads/`
- SQLite database is stored in `apps/server/data/`