// Mascot style: all the colors and the outfit are here, editable without touching the rig.

export interface AvatarStyle {
  // skin
  skin: string;
  skinShade: string;   // flat shadow
  skinLine: string;    // thin outline of the hands and face
  blush: string;
  // hair, facial hair
  hair: string;
  hairLight: string;   // highlights of the curls
  hairFade: string;    // short fade on the sides (shaved skin)
  beard: string;
  beardLight: string;
  brow: string;
  // mouth
  lip: string;
  lipDark: string;
  mouthInside: string;
  tongue: string;
  teeth: string;
  // eyes
  eyeWhite: string;
  iris: string;
  irisLight: string;
  pupil: string;
  // glasses
  glasses: string;
  glassesLight: string;
  lens: string;
  // outfit: t-shirt + open overshirt
  tee: string;
  teeShade: string;
  teeLine: string;
  overshirt: string;
  overshirtShade: string;
  overshirtLight: string;
  overshirtLine: string;
  button: string;
}

export const AVATAR_STYLE: AvatarStyle = {
  skin: '#E4B48F',
  skinShade: '#CF9A74',
  skinLine: '#9C6845',
  blush: '#E39A80',
  hair: '#1A1411',
  hairLight: '#4A3D35',
  hairFade: '#4A382E',
  beard: '#3B2F29',
  beardLight: '#5E4D42',
  brow: '#1D1613',
  lip: '#CC6F62',
  lipDark: '#7E3A33',
  mouthInside: '#4A1B1E',
  tongue: '#D9707A',
  teeth: '#FBF8F2',
  eyeWhite: '#FFFFFF',
  iris: '#4A2D1E',
  irisLight: '#7A4F35',
  pupil: '#150E0C',
  glasses: '#5F666D',
  glassesLight: '#D4D9DD',
  lens: 'rgba(196,220,238,0.15)',
  tee: '#FBFAF7',
  teeShade: '#E2DFD7',
  teeLine: '#B9B4A9',
  overshirt: '#8C8579',
  overshirtShade: '#746E63',
  overshirtLight: '#A39C90',
  overshirtLine: '#4C4740',
  button: '#3D3A35',
};
