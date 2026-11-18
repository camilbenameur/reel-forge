// Registry of the library A scenes (first half).
import type { SceneDefinition } from '../contract';
import { appWindow } from './app-window';
import { bigNumber } from './big-number';
import { chatClaude } from './chat-claude';
import { checklist } from './checklist';
import { commentCta } from './comment-cta';
import { cursorClick } from './cursor-click';
import { folder } from './folder';
import { halftoneBurst } from './halftone-burst';
import { phone } from './phone';
import { quoteCard } from './quote-card';
import { retentionGraph } from './retention-graph';
import { stepCard } from './step-card';
import { stepGrid } from './step-grid';
import { stopStamp } from './stop-stamp';
import { versus } from './versus';
import { viewCounter } from './view-counter';

export const SCENES_A: SceneDefinition[] = [
  stepCard,
  stepGrid,
  appWindow,
  phone,
  chatClaude,
  checklist,
  stopStamp,
  bigNumber,
  retentionGraph,
  viewCounter,
  commentCta,
  cursorClick,
  folder,
  versus,
  quoteCard,
  halftoneBurst,
];
