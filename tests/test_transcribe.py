#!/usr/bin/env python3
"""
test_transcribe.py — Unit tests for transcribe.py

Tests cover:
- Environment variable validation
- Timestamp formatting
- Speaker/segment alignment logic
- File collection and validation
- CLI argument parsing

To run: python -m pytest tests/test_transcribe.py -v
"""

import sys
import os
import tempfile
import shutil
from pathlib import Path
from datetime import datetime
from unittest.mock import Mock, patch, MagicMock
import pytest

# Add parent directory to path to import transcribe
sys.path.insert(0, str(Path(__file__).parent.parent))
import transcribe as t


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def temp_dir():
    """Create a temporary directory for test files."""
    tmpdir = tempfile.mkdtemp()
    yield Path(tmpdir)
    shutil.rmtree(tmpdir)


@pytest.fixture
def mock_wav_file(temp_dir):
    """Create a mock wav file for testing."""
    wav_path = temp_dir / "test_audio.wav"
    # Create a minimal valid WAV file header (44 bytes)
    with open(wav_path, 'wb') as f:
        # RIFF header
        f.write(b'RIFF')
        f.write((36).to_bytes(4, 'little'))  # file size - 8
        f.write(b'WAVE')
        # fmt chunk
        f.write(b'fmt ')
        f.write((16).to_bytes(4, 'little'))  # chunk size
        f.write((1).to_bytes(2, 'little'))    # audio format (PCM)
        f.write((1).to_bytes(2, 'little'))    # num channels
        f.write((16000).to_bytes(4, 'little')) # sample rate
        f.write((32000).to_bytes(4, 'little')) # byte rate
        f.write((2).to_bytes(2, 'little'))    # block align
        f.write((16).to_bytes(2, 'little'))   # bits per sample
        # data chunk
        f.write(b'data')
        f.write((0).to_bytes(4, 'little'))   # data size
    return wav_path


@pytest.fixture
def sample_diarization():
    """Sample diarization segments for testing."""
    return [
        {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00"},
        {"start": 5.0, "end": 10.0, "speaker": "SPEAKER_01"},
        {"start": 10.0, "end": 15.0, "speaker": "SPEAKER_00"},
    ]


@pytest.fixture
def sample_whisper_segments():
    """Sample Whisper transcription segments for testing."""
    return [
        {"start": 0.0, "end": 3.0, "text": "Hello there"},
        {"start": 3.0, "end": 5.5, "text": "how are you"},
        {"start": 5.5, "end": 8.0, "text": "I'm doing well"},
        {"start": 8.0, "end": 12.0, "text": "thanks for asking"},
        {"start": 12.0, "end": 15.0, "text": "goodbye"},
    ]


# =============================================================================
# Test format_timestamp
# =============================================================================

class TestFormatTimestamp:
    """Tests for the format_timestamp helper function."""

    def test_zero_seconds(self):
        """Test formatting of 0 seconds."""
        assert t.format_timestamp(0.0) == "00:00:00"

    def test_seconds_only(self):
        """Test formatting with only seconds."""
        assert t.format_timestamp(45.0) == "00:00:45"
        assert t.format_timestamp(59.0) == "00:00:59"

    def test_minutes_and_seconds(self):
        """Test formatting with minutes."""
        assert t.format_timestamp(60.0) == "00:01:00"
        assert t.format_timestamp(90.0) == "00:01:30"
        assert t.format_timestamp(599.0) == "00:09:59"

    def test_hours_minutes_seconds(self):
        """Test formatting with hours."""
        assert t.format_timestamp(3600.0) == "01:00:00"
        assert t.format_timestamp(3661.0) == "01:01:01"
        assert t.format_timestamp(86399.0) == "23:59:59"

    def test_decimal_seconds(self):
        """Test that decimal seconds are truncated."""
        assert t.format_timestamp(5.7) == "00:00:05"
        assert t.format_timestamp(90.999) == "00:01:30"


# =============================================================================
# Test validate_env
# =============================================================================

class TestValidateEnv:
    """Tests for environment variable validation."""

    def test_api_mode_missing_openai_key(self, monkeypatch):
        """Test that API mode fails without OPENAI_API_KEY."""
        monkeypatch.setattr(t, "OPENAI_API_KEY", None)
        monkeypatch.setattr(t, "HF_TOKEN", "test_token")
        
        with pytest.raises(SystemExit) as exc_info:
            t.validate_env(local_mode=False)
        assert exc_info.value.code == 1

    def test_api_mode_missing_hf_token(self, monkeypatch):
        """Test that API mode fails without HF_TOKEN."""
        monkeypatch.setattr(t, "OPENAI_API_KEY", "test_key")
        monkeypatch.setattr(t, "HF_TOKEN", None)
        
        with pytest.raises(SystemExit) as exc_info:
            t.validate_env(local_mode=False)
        assert exc_info.value.code == 1

    def test_api_mode_both_missing(self, monkeypatch):
        """Test that API mode fails when both keys are missing."""
        monkeypatch.setattr(t, "OPENAI_API_KEY", None)
        monkeypatch.setattr(t, "HF_TOKEN", None)
        
        with pytest.raises(SystemExit) as exc_info:
            t.validate_env(local_mode=False)
        assert exc_info.value.code == 1

    def test_api_mode_both_present(self, monkeypatch):
        """Test that API mode succeeds with both keys present."""
        monkeypatch.setattr(t, "OPENAI_API_KEY", "test_key")
        monkeypatch.setattr(t, "HF_TOKEN", "test_token")
        
        # Should not raise
        t.validate_env(local_mode=False)

    def test_local_mode_only_needs_hf_token(self, monkeypatch):
        """Test that local mode only requires HF_TOKEN."""
        monkeypatch.setattr(t, "OPENAI_API_KEY", None)
        monkeypatch.setattr(t, "HF_TOKEN", "test_token")
        
        # Should not raise
        t.validate_env(local_mode=True)

    def test_local_mode_missing_hf_token(self, monkeypatch):
        """Test that local mode fails without HF_TOKEN."""
        monkeypatch.setattr(t, "OPENAI_API_KEY", "test_key")
        monkeypatch.setattr(t, "HF_TOKEN", None)
        
        with pytest.raises(SystemExit) as exc_info:
            t.validate_env(local_mode=True)
        assert exc_info.value.code == 1


# =============================================================================
# Test find_speaker_for_segment
# =============================================================================

class TestFindSpeakerForSegment:
    """Tests for speaker assignment logic."""

    def test_exact_match(self, sample_diarization):
        """Test when segment exactly matches a diarization segment."""
        speaker = t.find_speaker_for_segment(0.0, 5.0, sample_diarization)
        assert speaker == "SPEAKER_00"

    def test_partial_overlap_majority(self, sample_diarization):
        """Test when segment mostly overlaps one speaker."""
        # 2 seconds with SPEAKER_00 (3.0-5.0), 2.5 seconds with SPEAKER_01 (5.0-7.5)
        # Actually SPEAKER_01 has more overlap
        speaker = t.find_speaker_for_segment(3.0, 7.5, sample_diarization)
        assert speaker == "SPEAKER_01"

    def test_partial_overlap_minority(self, sample_diarization):
        """Test when segment mostly overlaps the other speaker."""
        # 0.5 seconds with SPEAKER_00, 3 seconds with SPEAKER_01
        speaker = t.find_speaker_for_segment(4.5, 8.0, sample_diarization)
        assert speaker == "SPEAKER_01"

    def test_no_overlap(self, sample_diarization):
        """Test when segment has no overlap - should return UNKNOWN."""
        speaker = t.find_speaker_for_segment(100.0, 110.0, sample_diarization)
        assert speaker == "UNKNOWN"

    def test_single_segment(self):
        """Test with a single diarization segment."""
        diarization = [{"start": 0.0, "end": 10.0, "speaker": "SPEAKER_00"}]
        speaker = t.find_speaker_for_segment(2.0, 5.0, diarization)
        assert speaker == "SPEAKER_00"


# =============================================================================
# Test align
# =============================================================================

class TestAlign:
    """Tests for transcript-to-speaker alignment."""

    def test_align_basic(self, sample_diarization, sample_whisper_segments):
        """Test basic alignment of segments to speakers."""
        result = t.align(sample_whisper_segments, sample_diarization)
        
        assert len(result) == len(sample_whisper_segments)
        # First two segments should be SPEAKER_00
        assert result[0]["speaker"] == "SPEAKER_00"
        assert result[1]["speaker"] == "SPEAKER_00"
        # Middle segment should be SPEAKER_01
        assert result[2]["speaker"] == "SPEAKER_01"
        # Last two should be back to SPEAKER_00
        assert result[3]["speaker"] == "SPEAKER_01"
        assert result[4]["speaker"] == "SPEAKER_00"

    def test_align_preserves_text_and_timestamps(self, sample_diarization, sample_whisper_segments):
        """Test that alignment preserves original text and timestamps."""
        result = t.align(sample_whisper_segments, sample_diarization)
        
        for i, seg in enumerate(result):
            assert seg["start"] == sample_whisper_segments[i]["start"]
            assert seg["end"] == sample_whisper_segments[i]["end"]
            assert seg["text"] == sample_whisper_segments[i]["text"]

    def test_align_empty(self):
        """Test alignment with empty inputs."""
        result = t.align([], [])
        assert result == []


# =============================================================================
# Test merge_consecutive
# =============================================================================

class TestMergeConsecutive:
    """Tests for merging consecutive segments with same speaker."""

    def test_no_merge_needed(self):
        """Test when no segments need merging."""
        segments = [
            {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00", "text": "Hello"},
            {"start": 5.0, "end": 10.0, "speaker": "SPEAKER_01", "text": "Hi there"},
        ]
        result = t.merge_consecutive(segments)
        assert len(result) == 2
        assert result[0]["text"] == "Hello"
        assert result[1]["text"] == "Hi there"

    def test_merge_two_consecutive(self):
        """Test merging two consecutive segments from same speaker."""
        segments = [
            {"start": 0.0, "end": 3.0, "speaker": "SPEAKER_00", "text": "Hello "},
            {"start": 3.0, "end": 5.0, "speaker": "SPEAKER_00", "text": "there"},
        ]
        result = t.merge_consecutive(segments)
        assert len(result) == 1
        assert result[0]["start"] == 0.0
        assert result[0]["end"] == 5.0
        assert result[0]["text"] == "Hello there"

    def test_merge_three_consecutive(self):
        """Test merging three consecutive segments from same speaker."""
        segments = [
            {"start": 0.0, "end": 2.0, "speaker": "SPEAKER_00", "text": "Hello "},
            {"start": 2.0, "end": 4.0, "speaker": "SPEAKER_00", "text": "there "},
            {"start": 4.0, "end": 6.0, "speaker": "SPEAKER_00", "text": "friend"},
        ]
        result = t.merge_consecutive(segments)
        assert len(result) == 1
        assert result[0]["text"] == "Hello there friend"

    def test_merge_with_different_speakers(self):
        """Test merging only affects consecutive same-speaker segments."""
        segments = [
            {"start": 0.0, "end": 2.0, "speaker": "SPEAKER_00", "text": "Hello "},
            {"start": 2.0, "end": 4.0, "speaker": "SPEAKER_00", "text": "there"},
            {"start": 4.0, "end": 6.0, "speaker": "SPEAKER_01", "text": "Hi"},
            {"start": 6.0, "end": 8.0, "speaker": "SPEAKER_01", "text": " friend"},
        ]
        result = t.merge_consecutive(segments)
        assert len(result) == 2
        assert result[0]["speaker"] == "SPEAKER_00"
        assert result[0]["text"] == "Hello there"
        assert result[1]["speaker"] == "SPEAKER_01"
        assert result[1]["text"] == "Hi friend"

    def test_merge_empty_list(self):
        """Test merging an empty list."""
        result = t.merge_consecutive([])
        assert result == []

    def test_merge_single_segment(self):
        """Test merging a single segment."""
        segments = [
            {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00", "text": "Hello"},
        ]
        result = t.merge_consecutive(segments)
        assert len(result) == 1
        assert result[0]["text"] == "Hello"


# =============================================================================
# Test write_transcript
# =============================================================================

class TestWriteTranscript:
    """Tests for transcript file writing."""

    def test_creates_file(self, temp_dir):
        """Test that transcript file is created."""
        segments = [
            {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00", "text": "Hello there"},
        ]
        audio_path = temp_dir / "test_call.wav"
        output_path = t.write_transcript(segments, audio_path, temp_dir, "API", "whisper-1")
        
        assert output_path.exists()
        assert output_path.name == "test_call_whisper-1.txt"

    def test_file_content(self, temp_dir):
        """Test that transcript file contains expected content."""
        segments = [
            {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00", "text": "Hello there"},
            {"start": 5.0, "end": 10.0, "speaker": "SPEAKER_01", "text": "Hi"},
        ]
        audio_path = temp_dir / "test_call.wav"
        output_path = t.write_transcript(segments, audio_path, temp_dir, "API", "whisper-1")
        
        content = output_path.read_text()
        assert "File     : test_call.wav" in content
        assert "Mode     : API" in content
        assert "[00:00:00 --> 00:00:05] [SPEAKER 00]" in content
        assert "Hello there" in content
        assert "[00:00:05 --> 00:00:10] [SPEAKER 01]" in content
        assert "Hi" in content

    def test_speaker_underscore_replaced(self, temp_dir):
        """Test that underscores in speaker names are replaced with spaces."""
        segments = [
            {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00", "text": "Hello"},
        ]
        audio_path = temp_dir / "test_call.wav"
        output_path = t.write_transcript(segments, audio_path, temp_dir, "API", "whisper-1")
        
        content = output_path.read_text()
        assert "[SPEAKER 00]" in content
        assert "[SPEAKER_00]" not in content


# =============================================================================
# Test build_parser
# =============================================================================

class TestBuildParser:
    """Tests for CLI argument parsing."""

    def test_requires_file_or_dir(self):
        """Test that either --file or --dir is required."""
        parser = t.build_parser()
        with pytest.raises(SystemExit):
            parser.parse_args([])

    def test_accepts_file(self):
        """Test parsing --file argument."""
        parser = t.build_parser()
        args = parser.parse_args(["--file", "/path/to/audio.wav"])
        assert args.file == Path("/path/to/audio.wav")
        assert args.dir is None

    def test_accepts_dir(self):
        """Test parsing --dir argument."""
        parser = t.build_parser()
        args = parser.parse_args(["--dir", "/path/to/calls"])
        assert args.dir == Path("/path/to/calls")
        assert args.file is None

    def test_default_values(self):
        """Test default values for optional arguments."""
        parser = t.build_parser()
        args = parser.parse_args(["--file", "audio.wav"])
        assert args.output == Path("output")
        assert args.num_speakers == 2
        assert args.local is False
        assert args.whisper_model == "base"
        assert args.language is None

    def test_custom_values(self):
        """Test parsing all optional arguments."""
        parser = t.build_parser()
        args = parser.parse_args([
            "--file", "audio.wav",
            "--output", "./transcripts",
            "--num-speakers", "3",
            "--local",
            "--whisper-model", "large-v3",
            "--language", "es"
        ])
        assert args.output == Path("./transcripts")
        assert args.num_speakers == 3
        assert args.local is True
        assert args.whisper_model == "large-v3"
        assert args.language == "es"

    def test_whisper_model_choices(self):
        """Test that only valid whisper model choices are accepted."""
        parser = t.build_parser()
        
        # Valid choices should work
        for model in t.WHISPER_MODELS:
            args = parser.parse_args(["--file", "audio.wav", "--whisper-model", model])
            assert args.whisper_model == model
        
        # Invalid choice should fail
        with pytest.raises(SystemExit):
            parser.parse_args(["--file", "audio.wav", "--whisper-model", "invalid"])


# =============================================================================
# Test collect_files
# =============================================================================

class TestCollectFiles:
    """Tests for file collection logic."""

    def test_single_file(self, temp_dir, mock_wav_file):
        """Test collecting a single file."""
        args = Mock()
        args.file = mock_wav_file
        args.dir = None
        
        files = t.collect_files(args)
        assert len(files) == 1
        assert files[0] == mock_wav_file

    def test_single_file_not_found(self, temp_dir):
        """Test error when single file doesn't exist."""
        args = Mock()
        args.file = temp_dir / "nonexistent.wav"
        args.dir = None
        
        with pytest.raises(SystemExit) as exc_info:
            t.collect_files(args)
        assert exc_info.value.code == 1

    def test_single_file_unsupported_extension(self, temp_dir):
        """Test error when file has unsupported extension."""
        bad_file = temp_dir / "test.txt"
        bad_file.write_text("not audio")
        
        args = Mock()
        args.file = bad_file
        args.dir = None
        
        with pytest.raises(SystemExit) as exc_info:
            t.collect_files(args)
        assert exc_info.value.code == 1

    def test_directory_with_files(self, temp_dir):
        """Test collecting files from a directory."""
        # Create multiple audio files
        for ext in [".wav", ".mp3", ".m4a"]:
            (temp_dir / f"test{ext}").write_bytes(b"fake audio")
        
        # Create a non-audio file (should be ignored)
        (temp_dir / "readme.txt").write_text("not audio")
        
        args = Mock()
        args.file = None
        args.dir = temp_dir
        
        files = t.collect_files(args)
        assert len(files) == 3
        for f in files:
            assert f.suffix.lower() in t.SUPPORTED_EXTENSIONS

    def test_directory_not_found(self, temp_dir):
        """Test error when directory doesn't exist."""
        args = Mock()
        args.file = None
        args.dir = temp_dir / "nonexistent"
        
        with pytest.raises(SystemExit) as exc_info:
            t.collect_files(args)
        assert exc_info.value.code == 1

    def test_empty_directory(self, temp_dir):
        """Test error when directory has no supported audio files."""
        # Create only non-audio files
        (temp_dir / "readme.txt").write_text("not audio")
        (temp_dir / "image.jpg").write_bytes(b"fake image")
        
        args = Mock()
        args.file = None
        args.dir = temp_dir
        
        with pytest.raises(SystemExit) as exc_info:
            t.collect_files(args)
        assert exc_info.value.code == 1


# =============================================================================
# Integration-like tests
# =============================================================================

class TestFullPipeline:
    """Integration tests combining multiple functions."""

    def test_align_and_merge(self):
        """Test the full align + merge pipeline."""
        diarization = [
            {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_A"},
            {"start": 5.0, "end": 10.0, "speaker": "SPEAKER_B"},
        ]
        
        whisper_segments = [
            {"start": 0.0, "end": 2.0, "text": "Hello "},
            {"start": 2.0, "end": 4.0, "text": "world "},
            {"start": 4.0, "end": 5.0, "text": "today"},
            {"start": 5.0, "end": 7.0, "text": "How "},
            {"start": 7.0, "end": 10.0, "text": "are you"},
        ]
        
        # Align segments to speakers
        aligned = t.align(whisper_segments, diarization)
        
        # Merge consecutive same-speaker segments
        merged = t.merge_consecutive(aligned)
        
        # Should result in 2 segments (one per speaker)
        assert len(merged) == 2
        assert merged[0]["speaker"] == "SPEAKER_A"
        assert merged[0]["text"] == "Hello world today"
        assert merged[1]["speaker"] == "SPEAKER_B"
        assert merged[1]["text"] == "How are you"


# =============================================================================
# Mock-based tests for external dependencies
# =============================================================================

class TestExternalDependencies:
    """Tests using mocks for external dependencies."""

    @patch('transcribe.Pipeline')
    def test_load_diarization_pipeline(self, mock_pipeline_class):
        """Test loading the diarization pipeline with mocked pyannote."""
        mock_pipeline = MagicMock()
        mock_pipeline_class.from_pretrained.return_value = mock_pipeline
        
        # Set HF_TOKEN for the test
        with patch.dict(os.environ, {"HF_TOKEN": "test_token"}):
            result = t.load_diarization_pipeline()
        
        mock_pipeline_class.from_pretrained.assert_called_once()
        mock_pipeline.to.assert_called_once()
        assert result == mock_pipeline

    @patch('transcribe.Pipeline')
    def test_load_diarization_pipeline_failure(self, mock_pipeline_class):
        """Test handling when diarization pipeline fails to load."""
        mock_pipeline_class.from_pretrained.return_value = None
        
        with patch.dict(os.environ, {"HF_TOKEN": "test_token"}):
            with pytest.raises(SystemExit) as exc_info:
                t.load_diarization_pipeline()
            assert exc_info.value.code == 1


# =============================================================================
# Entry point
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])