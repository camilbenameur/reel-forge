// Main composition: reads a Timeline and stacks background, labels, captions, scenes,
// mascot and audio.
import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Avatar } from '../avatar/Avatar';
import { Background } from './Background';
import { Captions } from './Captions';
import { SceneHost, EXIT_FRAMES } from './SceneHost';
import { SectionLabel } from './SectionLabel';
import { blendPalette, nightAt, sceneFrames, themeEvents, themeOfNight } from './themeTimeline';
import type { Timeline } from './types';

export const Reel: React.FC<Timeline> = (timeline) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames: total } = useVideoConfig();

  const events = useMemo(
    () => themeEvents(timeline.theme, timeline.scenes, fps),
    [timeline.theme, timeline.scenes, fps],
  );
  const night = nightAt(events, frame);
  const theme = themeOfNight(night);
  const pal = blendPalette(night);

  const scenes = useMemo(
    () => [...timeline.scenes].sort((a, b) => a.start - b.start),
    [timeline.scenes],
  );

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Background night={night} />

      {scenes.map((spec, i) => {
        const { from, duration } = sceneFrames(spec, fps);
        const last = i === scenes.length - 1;
        // A scene stays mounted until the start of the next one: its exit (EXIT_FRAMES) overlaps the entrance of the
        // next one instead of leaving a gap. The last one holds until the very end (tail included).
        const hold = last ? Math.max(duration, total - from) : duration + EXIT_FRAMES;
        return (
          <Sequence key={spec.id} from={from} durationInFrames={Math.max(hold, EXIT_FRAMES + 1)} layout="none">
            <SceneHost
              spec={spec}
              fromFrame={from}
              durationInFrames={duration}
              theme={spec.theme ?? timeline.theme}
              isLast={last}
              words={timeline.words}
            />
          </Sequence>
        );
      })}

      <SectionLabel sections={timeline.sections} pal={pal} />
      <Captions pages={timeline.captions} words={timeline.words} pal={pal} language={timeline.language} />

      {timeline.avatar?.visible && <Avatar track={timeline.avatar} words={timeline.words} theme={theme} />}

      {timeline.audio ? <Audio src={staticFile(timeline.audio)} /> : null}
    </AbsoluteFill>
  );
};
