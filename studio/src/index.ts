// Remotion entry point: loads the fonts (core/fonts) then registers the root.
import './core/fonts';
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
