#!/usr/bin/env python3
"""
transcribe.py — Customer service call transcription with speaker diarization.

Supports two transcription modes:
  - API mode (default): uses OpenAI Whisper API — requires OPENAI_API_KEY
  - Local mode (--local): uses local openai-whisper model — fully offline

Speaker diarization always runs locally via pyannote.audio — requires HF_TOKEN.

Usage:
    python transcribe.py --file call.wav
    python transcribe.py --dir ./calls/
    python transcribe.py --file call.wav --local
    python transcribe.py --file call.wav --local --whisper-model large-v3
    python transcribe.py --dir ./calls/ --output ./transcripts/ --num-speakers 2
"""

import os
import sys
import warnings
import argparse
from pathlib import Path
from datetime import datetime

from dotenv import load_dotenv
import openai
import torch
from pyannote.audio import Pipeline

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
HF_TOKEN = os.getenv("HF_TOKEN")

SUPPORTED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".webm"}

# Local whisper model sizes, smallest → largest / fastest → most accurate
WHISPER_MODELS = ("tiny", "base", "small", "medium", "large", "large-v2", "large-v3")

# Approximate model sizes shown in output filenames
WHISPER_MODEL_SIZES = {
    "tiny":     "75MB",
    "base":     "145MB",
    "small":    "483MB",
    "medium":   "1.5GB",
    "large":    "3GB",
    "large-v2": "3GB",
    "large-v3": "3GB",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def format_timestamp(seconds: float) -> str:
    """Convert float seconds → HH:MM:SS string."""
    total = int(seconds)
    h, remainder = divmod(total, 3600)
    m, s = divmod(remainder, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def validate_env(local_mode: bool) -> None:
    """Abort early with a clear message if required env vars are missing."""
    missing = []
    if not local_mode and not OPENAI_API_KEY:
        missing.append("OPENAI_API_KEY")
    if not HF_TOKEN:
        missing.append("HF_TOKEN")
    if missing:
        print(f"[ERROR] Missing required variables in .env: {', '.join(missing)}")
        print("        See .env.example for reference.")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Diarization (always local via pyannote)
# ---------------------------------------------------------------------------

def load_diarization_pipeline() -> Pipeline:
    """
    Load pyannote speaker-diarization-3.1 pipeline.

    First run will download the model (~1 GB). Requires:
    - A Hugging Face account with HF_TOKEN in .env
    - Accepted terms for pyannote/speaker-diarization-3.1 and
      pyannote/segmentation-3.0 on huggingface.co
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"  Device: {device}")

    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        token=HF_TOKEN,
    )
    if pipeline is None:
        print("[ERROR] Failed to load diarization pipeline.")
        print("        Check that HF_TOKEN is valid and that you have accepted")
        print("        the model terms at huggingface.co/pyannote/speaker-diarization-3.1")
        sys.exit(1)
    pipeline.to(device)
    return pipeline


def run_diarization(pipeline: Pipeline, audio_path: Path, num_speakers: int) -> list[dict]:
    """
    Return a list of speaker segments:
        [{"start": float, "end": float, "speaker": str}, ...]

    Audio is pre-loaded with torchaudio and passed as a dict to bypass
    pyannote's internal torchcodec decoder, which requires a linked FFmpeg.
    """
    import torchaudio

    # Suppress the verbose torchcodec/FFmpeg warning — we handle it ourselves below
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            waveform, sample_rate = torchaudio.load(str(audio_path), backend="ffmpeg")
        except Exception:
            try:
                waveform, sample_rate = torchaudio.load(str(audio_path), backend="soundfile")
            except Exception:
                raise RuntimeError(
                    f"Could not decode '{audio_path.name}'.\n"
                    "        MP3 files require FFmpeg. Install it with:\n"
                    "          macOS:   brew install ffmpeg\n"
                    "          Ubuntu:  sudo apt install ffmpeg\n"
                    "          Windows: https://ffmpeg.org/download.html"
                )

    audio = {"waveform": waveform, "sample_rate": sample_rate}
    result = pipeline(audio, num_speakers=num_speakers)

    # Newer pyannote versions wrap the output; find the Annotation object
    # by searching for whichever attribute has an itertracks method.
    if hasattr(result, "itertracks"):
        annotation = result
    else:
        annotation = None
        for attr in vars(result).values():
            if hasattr(attr, "itertracks"):
                annotation = attr
                break
        if annotation is None:
            raise RuntimeError(
                f"Unexpected diarization output type: {type(result)}. "
                f"Attributes: {list(vars(result).keys())}"
            )

    segments = []
    for turn, _, speaker in annotation.itertracks(yield_label=True):
        segments.append({"start": turn.start, "end": turn.end, "speaker": speaker})
    return segments


# ---------------------------------------------------------------------------
# Transcription — API mode
# ---------------------------------------------------------------------------

def run_transcription_api(client, audio_path: Path, language: str | None) -> list[dict]:
    """
    Send audio to OpenAI Whisper API and return timestamped segments:
        [{"start": float, "end": float, "text": str}, ...]

    language=None → auto-detect per segment (preserves Spanish/English mixing).
    """
    params = dict(
        model="whisper-1",
        file=None,
        response_format="verbose_json",
        timestamp_granularities=["segment"],
        task="transcribe",
    )
    if language:
        params["language"] = language

    with open(audio_path, "rb") as f:
        params["file"] = f
        response = client.audio.transcriptions.create(**params)

    return [
        {"start": seg.start, "end": seg.end, "text": seg.text.strip()}
        for seg in response.segments
    ]


# ---------------------------------------------------------------------------
# Transcription — local mode
# ---------------------------------------------------------------------------

def load_whisper_model(model_name: str):
    """Load the local openai-whisper model onto the best available device."""
    try:
        import whisper  # type: ignore[import-untyped]
    except ImportError:
        print("[ERROR] openai-whisper is not installed.")
        print("        Run: pip install openai-whisper")
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"  Loading local Whisper model '{model_name}' on {device}...")
    return whisper.load_model(model_name, device=device)


def run_transcription_local(model, audio_path: Path, language: str | None) -> list[dict]:
    """
    Transcribe audio with a local Whisper model and return timestamped segments:
        [{"start": float, "end": float, "text": str}, ...]

    language=None → auto-detect per 30-second chunk (preserves Spanish/English mixing).
    task="transcribe" ensures Spanish is kept as Spanish, never translated.
    """
    kwargs = {"verbose": False, "task": "transcribe"}
    if language:
        kwargs["language"] = language
    result = model.transcribe(str(audio_path), **kwargs)
    return [
        {"start": seg["start"], "end": seg["end"], "text": seg["text"].strip()}
        for seg in result["segments"]
    ]


# ---------------------------------------------------------------------------
# Alignment
# ---------------------------------------------------------------------------

def find_speaker_for_segment(
    seg_start: float,
    seg_end: float,
    diarization: list[dict],
) -> str:
    """Return the speaker label with the greatest overlap with the given segment."""
    best_speaker = "UNKNOWN"
    best_overlap = 0.0

    for d in diarization:
        overlap = max(0.0, min(seg_end, d["end"]) - max(seg_start, d["start"]))
        if overlap > best_overlap:
            best_overlap = overlap
            best_speaker = d["speaker"]

    return best_speaker


def align(whisper_segments: list[dict], diarization: list[dict]) -> list[dict]:
    """Assign a speaker label to each Whisper segment."""
    return [
        {
            "start": seg["start"],
            "end": seg["end"],
            "speaker": find_speaker_for_segment(seg["start"], seg["end"], diarization),
            "text": seg["text"],
        }
        for seg in whisper_segments
    ]


def merge_consecutive(segments: list[dict]) -> list[dict]:
    """Merge back-to-back segments that share the same speaker."""
    if not segments:
        return []

    merged = [segments[0].copy()]
    for seg in segments[1:]:
        last = merged[-1]
        if seg["speaker"] == last["speaker"]:
            last["end"] = seg["end"]
            last["text"] = last["text"].rstrip() + " " + seg["text"].lstrip()
        else:
            merged.append(seg.copy())

    return merged


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def write_transcript(
    segments: list[dict],
    audio_path: Path,
    output_dir: Path,
    mode: str,
    model_name: str,
) -> Path:
    """Write aligned, merged segments to a .txt file."""
    output_path = output_dir / f"{audio_path.stem}_{model_name}.txt"

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(f"File     : {audio_path.name}\n")
        f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Mode     : {mode}\n")
        f.write("=" * 60 + "\n\n")

        for seg in segments:
            start = format_timestamp(seg["start"])
            end = format_timestamp(seg["end"])
            speaker = seg["speaker"].replace("_", " ")
            f.write(f"[{start} --> {end}] [{speaker}]\n")
            f.write(f"{seg['text']}\n\n")

    return output_path


# ---------------------------------------------------------------------------
# File processing
# ---------------------------------------------------------------------------

def process_file(
    audio_path: Path,
    diarization_pipeline: Pipeline,
    num_speakers: int,
    transcribe_fn,
    output_dir: Path,
    mode: str,
    model_name: str,
) -> bool:
    """
    Full pipeline for one audio file.
    Returns True on success, False on failure.
    """
    print(f"\n[{audio_path.name}]")

    try:
        print("  Diarizing speakers...")
        diarization = run_diarization(diarization_pipeline, audio_path, num_speakers)

        print("  Transcribing...")
        whisper_segments = transcribe_fn(audio_path)

        print("  Aligning transcript to speakers...")
        aligned = align(whisper_segments, diarization)
        merged = merge_consecutive(aligned)

        output_path = write_transcript(merged, audio_path, output_dir, mode, model_name)
        print(f"  Saved → {output_path}")
        return True

    except Exception as exc:
        print(f"  [ERROR] {exc}")
        return False


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Transcribe customer service calls with speaker diarization.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python transcribe.py --file recording.wav
  python transcribe.py --file recording.wav --local
  python transcribe.py --file recording.wav --local --whisper-model large-v3
  python transcribe.py --dir ./calls/
  python transcribe.py --dir ./calls/ --output ./transcripts/ --num-speakers 3
        """,
    )

    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--file", type=Path, metavar="PATH", help="Single audio file to process")
    source.add_argument("--dir", type=Path, metavar="PATH", help="Directory of audio files to process")

    parser.add_argument(
        "--output",
        type=Path,
        default=Path("output"),
        metavar="PATH",
        help="Output directory for transcripts (default: ./output)",
    )
    parser.add_argument(
        "--num-speakers",
        type=int,
        default=2,
        metavar="N",
        help="Expected number of speakers per call (default: 2)",
    )
    parser.add_argument(
        "--local",
        action="store_true",
        help="Use a local Whisper model instead of the OpenAI API (fully offline)",
    )
    parser.add_argument(
        "--whisper-model",
        default="base",
        choices=WHISPER_MODELS,
        metavar="MODEL",
        help=(
            f"Local Whisper model size — only used with --local. "
            f"Options: {', '.join(WHISPER_MODELS)} (default: base). "
            "Larger models are more accurate but slower and require more RAM/VRAM."
        ),
    )
    parser.add_argument(
        "--language",
        default=None,
        metavar="LANG",
        help=(
            "Language code to force for transcription, e.g. 'en' or 'es'. "
            "Omit (default) to auto-detect — recommended for calls that mix "
            "English and Spanish, as Whisper will preserve each language as spoken."
        ),
    )

    return parser


def collect_files(args: argparse.Namespace) -> list[Path]:
    """Resolve and validate the list of audio files to process."""
    if args.file:
        if not args.file.exists():
            print(f"[ERROR] File not found: {args.file}")
            sys.exit(1)
        if args.file.suffix.lower() not in SUPPORTED_EXTENSIONS:
            print(f"[ERROR] Unsupported file type: {args.file.suffix}")
            sys.exit(1)
        return [args.file]

    if not args.dir.exists():
        print(f"[ERROR] Directory not found: {args.dir}")
        sys.exit(1)

    files = [
        p for p in sorted(args.dir.iterdir())
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS
    ]

    if not files:
        print(f"[ERROR] No supported audio files found in: {args.dir}")
        print(f"        Supported formats: {', '.join(SUPPORTED_EXTENSIONS)}")
        sys.exit(1)

    print(f"Found {len(files)} audio file(s) in {args.dir}")
    return files


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    validate_env(local_mode=args.local)

    args.output.mkdir(parents=True, exist_ok=True)

    files = collect_files(args)

    # Build a zero-argument transcription callable so process_file stays generic
    if args.local:
        whisper_model = load_whisper_model(args.whisper_model)
        transcribe_fn = lambda path: run_transcription_local(whisper_model, path, args.language)
        mode = f"local ({args.whisper_model})"
        size = WHISPER_MODEL_SIZES.get(args.whisper_model, "")
        model_name = f"{args.whisper_model}_{size}" if size else args.whisper_model
    else:
        client = openai.OpenAI(api_key=OPENAI_API_KEY)
        transcribe_fn = lambda path: run_transcription_api(client, path, args.language)
        mode = "OpenAI API (whisper-1)"
        model_name = "whisper-1"

    print("\nLoading diarization pipeline (first run downloads ~1 GB model)...")
    diarization_pipeline = load_diarization_pipeline()

    successes = 0
    for audio_path in files:
        if process_file(audio_path, diarization_pipeline, args.num_speakers, transcribe_fn, args.output, mode, model_name):
            successes += 1

    total = len(files)
    print(f"\n{'=' * 60}")
    print(f"Done. {successes}/{total} file(s) transcribed successfully.")
    if successes < total:
        print(f"      {total - successes} file(s) failed — check errors above.")


if __name__ == "__main__":
    main()
