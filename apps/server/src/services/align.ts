import { Segment } from '../types';
import { WhisperSegment } from './whisper';
import { SpeakerTurn } from './diarize';

function computeOverlap(
  segStart: number,
  segEnd: number,
  turnStart: number,
  turnEnd: number
): number {
  const overlapStart = Math.max(segStart, turnStart);
  const overlapEnd = Math.min(segEnd, turnEnd);
  return Math.max(0, overlapEnd - overlapStart);
}

export function align(
  whisperSegments: WhisperSegment[],
  speakerTurns: SpeakerTurn[]
): Segment[] {
  const labeled: Segment[] = whisperSegments.map((seg) => {
    let bestSpeaker = 'SPEAKER_A';
    let bestOverlap = -1;

    for (const turn of speakerTurns) {
      const overlap = computeOverlap(seg.start, seg.end, turn.start, turn.end);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestSpeaker = turn.speaker;
      }
    }

    return {
      start: seg.start,
      end: seg.end,
      speaker: bestSpeaker,
      text: seg.text,
    };
  });

  if (labeled.length === 0) return [];

  const merged: Segment[] = [];
  let current: Segment = { ...labeled[0] };

  for (let i = 1; i < labeled.length; i++) {
    const seg = labeled[i];
    if (seg.speaker === current.speaker) {
      current.end = seg.end;
      current.text = current.text + ' ' + seg.text;
    } else {
      merged.push(current);
      current = { ...seg };
    }
  }
  merged.push(current);

  return merged;
}
