#!/usr/bin/env python3
import sys
import json
import os
import tempfile


def main():
    if len(sys.argv) < 2:
        print("Usage: diarize_pyannote.py <audio_path> [num_speakers]", file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    num_speakers = int(sys.argv[2]) if len(sys.argv) > 2 else None

    hf_token = os.environ.get("HUGGINGFACE_TOKEN")
    if not hf_token:
        print("Error: HUGGINGFACE_TOKEN environment variable not set", file=sys.stderr)
        sys.exit(1)

    print("Loading pyannote pipeline...", file=sys.stderr)

    from pyannote.audio import Pipeline
    import torch

    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        token=hf_token,
    )

    if torch.cuda.is_available():
        print("Using GPU", file=sys.stderr)
        pipeline = pipeline.to(torch.device("cuda"))
    else:
        print("Using CPU", file=sys.stderr)

    # Convert to WAV if needed — pyannote can miscount samples in compressed formats
    import torchaudio
    wav_path = audio_path
    tmp_file = None
    if not audio_path.lower().endswith(".wav"):
        print(f"Converting {os.path.splitext(audio_path)[1]} to WAV...", file=sys.stderr)
        waveform, sample_rate = torchaudio.load(audio_path)
        tmp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        torchaudio.save(tmp_file.name, waveform, sample_rate)
        wav_path = tmp_file.name

    print(f"Running diarization on: {audio_path}", file=sys.stderr)

    kwargs = {}
    if num_speakers is not None and num_speakers > 0:
        kwargs["num_speakers"] = num_speakers

    try:
        diarization = pipeline(wav_path, **kwargs)
    finally:
        if tmp_file is not None:
            os.unlink(tmp_file.name)

    # Unwrap DiarizeOutput (newer pyannote) or use directly (older versions)
    if hasattr(diarization, 'itertracks'):
        annotation = diarization
    elif hasattr(diarization, 'speaker_diarization'):
        annotation = diarization.speaker_diarization
    elif hasattr(diarization, 'annotation'):
        annotation = diarization.annotation
    else:
        raise RuntimeError(f"Unexpected diarization output type: {type(diarization)}, attrs: {[a for a in dir(diarization) if not a.startswith('_')]}")

    turns = []
    for turn, _, speaker in annotation.itertracks(yield_label=True):
        turns.append({
            "start": round(turn.start, 3),
            "end": round(turn.end, 3),
            "speaker": speaker,
        })

    print(json.dumps(turns))


if __name__ == "__main__":
    main()
