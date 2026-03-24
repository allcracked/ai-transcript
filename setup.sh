#!/usr/bin/env bash
# setup.sh — Environment setup for whisper-for-calls (macOS / Linux)
#
# All packages are installed into a local .venv directory.
# Nothing is installed globally.

set -e

VENV_DIR=".venv"
PYTHON_MIN_MAJOR=3
PYTHON_MIN_MINOR=9

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n'   "$*"; }

# ---------------------------------------------------------------------------
# 1. Locate Python 3.9+
# ---------------------------------------------------------------------------

bold "==> Checking Python version..."

SYS_PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" &>/dev/null; then
        version=$("$candidate" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null)
        major=$(echo "$version" | cut -d. -f1)
        minor=$(echo "$version" | cut -d. -f2)
        if [ "$major" -ge "$PYTHON_MIN_MAJOR" ] && [ "$minor" -ge "$PYTHON_MIN_MINOR" ]; then
            SYS_PYTHON="$candidate"
            green "    Found: $("$SYS_PYTHON" --version)"
            break
        fi
    fi
done

if [ -z "$SYS_PYTHON" ]; then
    red "    Python $PYTHON_MIN_MAJOR.$PYTHON_MIN_MINOR+ is required but was not found."
    echo "    Install it from https://www.python.org/downloads/"
    exit 1
fi

# ---------------------------------------------------------------------------
# 2. Create virtual environment
# ---------------------------------------------------------------------------

bold "==> Setting up local virtual environment in './$VENV_DIR'..."

if [ -d "$VENV_DIR" ]; then
    yellow "    '$VENV_DIR' already exists — skipping creation."
else
    "$SYS_PYTHON" -m venv "$VENV_DIR"
    green "    Virtual environment created."
fi

# Point directly to the venv's executables — no reliance on shell activation
VENV_PYTHON="$VENV_DIR/bin/python"
VENV_PIP="$VENV_DIR/bin/pip"

green "    Using: $VENV_PYTHON"

# ---------------------------------------------------------------------------
# 3. Upgrade pip (inside the venv)
# ---------------------------------------------------------------------------

bold "==> Upgrading pip inside venv..."
"$VENV_PYTHON" -m pip install --upgrade pip --quiet

# ---------------------------------------------------------------------------
# 4. Install core dependencies (into the venv)
# ---------------------------------------------------------------------------

bold "==> Installing core dependencies into venv..."
"$VENV_PIP" install -r requirements.txt
green "    Core dependencies installed."

# ---------------------------------------------------------------------------
# 5. Optional: local Whisper model (into the venv)
# ---------------------------------------------------------------------------

echo ""
read -r -p "Install openai-whisper for fully offline transcription (--local mode)? [y/N] " install_whisper
if [[ "$install_whisper" =~ ^[Yy]$ ]]; then
    bold "==> Installing openai-whisper into venv..."
    "$VENV_PIP" install openai-whisper
    green "    openai-whisper installed."
fi

# ---------------------------------------------------------------------------
# 6. FFmpeg check (system-level — not in venv)
# ---------------------------------------------------------------------------

bold "==> Checking for FFmpeg..."
if command -v ffmpeg &>/dev/null; then
    green "    FFmpeg found: $(ffmpeg -version 2>&1 | head -1)"
else
    yellow "    FFmpeg not found — required for MP3 / M4A files."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "    Install with:  brew install ffmpeg"
    else
        echo "    Install with:  sudo apt install ffmpeg   (Debian/Ubuntu)"
        echo "                   sudo dnf install ffmpeg   (Fedora)"
    fi
fi

# ---------------------------------------------------------------------------
# 7. Create .env if missing
# ---------------------------------------------------------------------------

bold "==> Checking .env file..."
if [ -f ".env" ]; then
    yellow "    .env already exists — skipping."
else
    cp .env.example .env
    green "    Created .env from .env.example."
    yellow "    Open .env and fill in your OPENAI_API_KEY and HF_TOKEN."
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo ""
green "============================================================"
bold " Setup complete! All packages installed locally in ./$VENV_DIR"
green "============================================================"
echo ""
echo "  Next steps:"
echo "    1. Edit .env and add your API keys"
echo "    2. Accept HuggingFace model terms (first-time only):"
echo "         https://huggingface.co/pyannote/speaker-diarization-3.1"
echo "         https://huggingface.co/pyannote/segmentation-3.0"
echo "         https://huggingface.co/pyannote/speaker-diarization-community-1"
echo "    3. Activate the environment before running:"
echo "         source $VENV_DIR/bin/activate"
echo "    4. Run the script:"
echo "         python transcribe.py --file call.wav --local"
echo ""
