// Interface commune à toutes les scènes. Une scène est rendue dans un <Sequence> qui commence à
// SceneSpec.start : useCurrentFrame() y vaut 0 au début de la scène.
import type React from 'react';
import type { SceneSpec, Theme } from '../core/types';

export interface SceneContext {
  fps: number;
  theme: Theme;
  durationInFrames: number;   // durée de la scène en images
  // Image (relative au début de la scène) où tombe le repère `name`, ou `fallback` (images) s'il
  // n'existe pas. C'est ce qui fait « une image par mot » : un élément apparaît sur son mot.
  cue: (name: string | undefined, fallback?: number) => number;
}

export interface SceneComponentProps<P = Record<string, unknown>> {
  props: P;
  spec: SceneSpec;
  ctx: SceneContext;
}

export interface SceneDefinition<P = any> {
  type: string;                 // identifiant kebab-case, unique
  description: string;          // une ligne, lue par Claude pour choisir la scène
  exampleProps: P;              // exemple complet en français, sert à la planche de test et à la doc
  cues?: string[];              // noms de repères que la scène sait exploiter (en plus de ceux des items)
  Component: React.FC<SceneComponentProps<P>>;
}

// Zone utile d'une scène dans l'image 1080×1920 : sous les sous-titres, à gauche de la mascotte.
export const SCENE_BOX = { x: 60, y: 560, width: 960, height: 760 } as const;
