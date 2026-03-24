@echo off
:: setup.bat — Environment setup for whisper-for-calls (Windows)
::
:: All packages are installed into a local .venv directory.
:: Nothing is installed globally.

setlocal EnableDelayedExpansion

set VENV_DIR=.venv

echo.
echo ============================================================
echo  whisper-for-calls — Windows Setup
echo  All packages will be installed locally in .\%VENV_DIR%
echo ============================================================
echo.

:: ---------------------------------------------------------------------------
:: 1. Locate Python 3.9+
:: ---------------------------------------------------------------------------

echo [1/6] Checking Python version...

set SYS_PYTHON=
for %%P in (python python3) do (
    if "!SYS_PYTHON!"=="" (
        where %%P >nul 2>&1
        if !errorlevel! == 0 (
            set SYS_PYTHON=%%P
        )
    )
)

if "!SYS_PYTHON!"=="" (
    echo     ERROR: Python was not found in PATH.
    echo     Install it from https://www.python.org/downloads/
    echo     Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

for /f "tokens=*" %%V in ('!SYS_PYTHON! --version 2^>^&1') do set PYVER=%%V
echo     Found: !PYVER!

:: Check minimum version (3.9)
for /f "tokens=2 delims= " %%V in ("!PYVER!") do set PYVER_NUM=%%V
for /f "tokens=1,2 delims=." %%A in ("!PYVER_NUM!") do (
    set MAJOR=%%A
    set MINOR=%%B
)

if !MAJOR! LSS 3 (
    echo     ERROR: Python 3.9+ is required. Found !PYVER!
    pause
    exit /b 1
)
if !MAJOR! EQU 3 if !MINOR! LSS 9 (
    echo     ERROR: Python 3.9+ is required. Found !PYVER!
    pause
    exit /b 1
)

:: ---------------------------------------------------------------------------
:: 2. Create virtual environment
:: ---------------------------------------------------------------------------

echo.
echo [2/6] Setting up local virtual environment in '.\!VENV_DIR!'...

if exist "!VENV_DIR!\Scripts\python.exe" (
    echo     '!VENV_DIR!' already exists — skipping creation.
) else (
    !SYS_PYTHON! -m venv !VENV_DIR!
    if !errorlevel! neq 0 (
        echo     ERROR: Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo     Virtual environment created.
)

:: Point directly to the venv's executables — no reliance on PATH changes
set VENV_PYTHON=!VENV_DIR!\Scripts\python.exe
set VENV_PIP=!VENV_DIR!\Scripts\pip.exe

echo     Using: !VENV_PYTHON!

:: ---------------------------------------------------------------------------
:: 3. Upgrade pip (inside the venv)
:: ---------------------------------------------------------------------------

echo.
echo [3/6] Upgrading pip inside venv...
"!VENV_PYTHON!" -m pip install --upgrade pip --quiet

:: ---------------------------------------------------------------------------
:: 4. Install core dependencies (into the venv)
:: ---------------------------------------------------------------------------

echo.
echo [4/6] Installing core dependencies into venv...
"!VENV_PIP!" install -r requirements.txt
if !errorlevel! neq 0 (
    echo     ERROR: Dependency installation failed.
    pause
    exit /b 1
)
echo     Core dependencies installed.

:: ---------------------------------------------------------------------------
:: 5. Optional: local Whisper model (into the venv)
:: ---------------------------------------------------------------------------

echo.
set /p INSTALL_WHISPER="[5/6] Install openai-whisper for fully offline transcription (--local mode)? [y/N]: "
if /i "!INSTALL_WHISPER!"=="y" (
    echo     Installing openai-whisper into venv...
    "!VENV_PIP!" install openai-whisper
    echo     openai-whisper installed.
) else (
    echo     Skipped.
)

:: ---------------------------------------------------------------------------
:: 6. FFmpeg check (system-level — not in venv)
:: ---------------------------------------------------------------------------

echo.
echo [6/6] Checking for FFmpeg...
where ffmpeg >nul 2>&1
if !errorlevel! == 0 (
    for /f "tokens=*" %%V in ('ffmpeg -version 2^>^&1') do (
        echo     Found: %%V
        goto :ffmpeg_done
    )
) else (
    echo     WARNING: FFmpeg not found — required for MP3 / M4A files.
    echo     Download the "full-shared" build from: https://ffmpeg.org/download.html
    echo     Then add the bin\ folder to your system PATH.
)
:ffmpeg_done

:: ---------------------------------------------------------------------------
:: 7. Create .env if missing
:: ---------------------------------------------------------------------------

echo.
if exist ".env" (
    echo     .env already exists — skipping.
) else (
    copy ".env.example" ".env" >nul
    echo     Created .env from .env.example.
    echo     Open .env and fill in your OPENAI_API_KEY and HF_TOKEN.
)

:: ---------------------------------------------------------------------------
:: Done
:: ---------------------------------------------------------------------------

echo.
echo ============================================================
echo  Setup complete! All packages installed locally in .\!VENV_DIR!
echo ============================================================
echo.
echo   Next steps:
echo     1. Edit .env and add your API keys
echo     2. Accept HuggingFace model terms (first-time only):
echo          https://huggingface.co/pyannote/speaker-diarization-3.1
echo          https://huggingface.co/pyannote/segmentation-3.0
echo          https://huggingface.co/pyannote/speaker-diarization-community-1
echo     3. Activate the environment before running:
echo          !VENV_DIR!\Scripts\activate.bat
echo     4. Run the script:
echo          python transcribe.py --file call.wav --local
echo.
pause
