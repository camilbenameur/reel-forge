// Remotion entry point: registers the root (fonts are loaded by <FontGate>, see core/fonts.tsx).
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
