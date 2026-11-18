// Common interface of all scenes. A scene is rendered inside a <Sequence> that starts at
// SceneSpec.start: useCurrentFrame() is 0 at the start of the scene.
import type React from 'react';
import type { SceneSpec, Theme } from '../core/types';

export interface SceneContext {
  fps: number;
  theme: Theme;
  durationInFrames: number;   // scene duration in frames
  // Frame (relative to the start of the scene) where the cue `name` falls, or `fallback` (frames) if it
  // does not exist. This is what makes "one image per word": an element appears on its word.
  cue: (name: string | undefined, fallback?: number) => number;
}

export interface SceneComponentProps<P = Record<string, unknown>> {
  props: P;
  spec: SceneSpec;
  ctx: SceneContext;
}

export interface SceneDefinition<P = any> {
  type: string;                 // kebab-case identifier, unique
  description: string;          // one line, read by the script LLM to choose the scene
  exampleProps: P;              // complete example, used by the test sheet and the docs
  cues?: string[];              // names of the cues the scene can use (in addition to those of the items)
  Component: React.FC<SceneComponentProps<P>>;
}

// Usable area of a scene in the 1080x1920 frame: below the captions, left of the mascot.
export const SCENE_BOX = { x: 60, y: 560, width: 960, height: 760 } as const;
