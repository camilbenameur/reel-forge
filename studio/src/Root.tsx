// Remotion root: Reel compositions (full reel), ScenesSheet (all scenes) and AvatarSheet.
import React from 'react';
import { Composition, type CalculateMetadataFunction } from 'remotion';
import { AvatarSheet } from './avatar/AvatarSheet';
import { FontGate } from './core/fonts';
import { Reel } from './core/Reel';
import { ScenesSheet, sheetDuration } from './core/ScenesSheet';
import type { Timeline } from './core/types';
import demo from './fixtures/demo-timeline.json';

type ReelProps = Timeline & Record<string, unknown>;
const gated = <P extends object>(Component: React.FC<P>): React.FC<P> => (props) => (
  <FontGate>
    <Component {...props} />
  </FontGate>
);
const GatedReel = gated(Reel);
const GatedScenesSheet = gated(ScenesSheet);
const GatedAvatarSheet = gated(AvatarSheet);

const demoTimeline = demo as unknown as ReelProps;

const calculateMetadata: CalculateMetadataFunction<ReelProps> = ({ props }) => ({
  durationInFrames: props.durationInFrames,
  fps: props.fps,
  width: props.width,
  height: props.height,
});

export const RemotionRoot: React.FC = () => (
  <>
    <Composition<any, ReelProps>
      id="Reel"
      component={GatedReel}
      durationInFrames={demoTimeline.durationInFrames}
      fps={demoTimeline.fps}
      width={demoTimeline.width}
      height={demoTimeline.height}
      defaultProps={demoTimeline}
      calculateMetadata={calculateMetadata}
    />
    <Composition
      id="ScenesSheet"
      component={GatedScenesSheet}
      durationInFrames={sheetDuration()}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition id="AvatarSheet" component={GatedAvatarSheet} durationInFrames={300} fps={30} width={1080} height={1920} />
  </>
);
