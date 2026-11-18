// Registry of the scenes of library B (16 scenes).
import type { SceneDefinition } from '../contract';
import { keysScene } from './keys';
import { apiHubScene } from './api-hub';
import { calendarScene } from './calendar';
import { envelopeScene } from './envelope';
import { questionMarkScene } from './question-mark';
import { corkboardScene } from './corkboard';
import { chartBarsScene } from './chart-bars';
import { timelineStepsScene } from './timeline-steps';
import { codeSnippetScene } from './code-snippet';
import { toggleScene } from './toggle';
import { loadingBarScene } from './loading-bar';
import { priceTagScene } from './price-tag';
import { browserPageScene } from './browser-page';
import { stackCardsScene } from './stack-cards';
import { iconRowScene } from './icon-row';
import { arrowAnnotateScene } from './arrow-annotate';

export const SCENES_B: SceneDefinition[] = [
  keysScene,
  apiHubScene,
  calendarScene,
  envelopeScene,
  questionMarkScene,
  corkboardScene,
  chartBarsScene,
  timelineStepsScene,
  codeSnippetScene,
  toggleScene,
  loadingBarScene,
  priceTagScene,
  browserPageScene,
  stackCardsScene,
  iconRowScene,
  arrowAnnotateScene,
];
