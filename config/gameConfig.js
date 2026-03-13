function readGameFlags() {
  const defaults = {
    enableWordTypeGame: true,
    enableVerbFormGame: true
  };

  const mergeFlags = source => {
    if (!source || typeof source !== 'object') return;
    const flags = source.QQ_GAME_FLAGS;
    if (!flags || typeof flags !== 'object') return;
    Object.assign(defaults, flags);
  };

  if (typeof window !== 'undefined') {
    mergeFlags(window);
    try {
      if (window.parent && window.parent !== window) mergeFlags(window.parent);
    } catch {}
    try {
      if (window.top && window.top !== window && window.top !== window.parent) mergeFlags(window.top);
    } catch {}
  }

  return defaults;
}

const GAME_FLAGS = readGameFlags();

const RAW_GAMES = [
  {
    type:         'arrange',
    id:           'arrangeSelector',
    title:        'Arrange Words',
    description:  'Build the full verse by matching the words using the English meaning or your memory.',
    buttonId:     'playArrangeBtn',
    fontFamily:   "'Roboto', sans-serif",
    fontSize:     '1rem',
    textAlign:    'center',
    disabled:     false,
  },
  {
    type:         'verb',
    id:           'verbSelector',
    title:        'Verb Match',
    description:  'Verbs and their roots make up about 20% of Quranic vocabulary. Match the verbs to their meanings in English.',
    buttonId:     'playVerbBtn',
    fontFamily:   "'Roboto', sans-serif",
    fontSize:     '1rem',
    textAlign:    'center',
    disabled:     false,
  },
  {
    type:         'wordType',
    id:           'wordTypeSelector',
    title:        'Word Type',
    description:  'Identify each word as verb, noun, or particle, the three pillars of Arabic grammar.',
    buttonId:     'playWordTypeBtn',
    fontFamily:   "'Roboto', sans-serif",
    fontSize:     '1rem',
    textAlign:    'center',
    disabled:     !GAME_FLAGS.enableWordTypeGame,
  },
  {
    type:         'verbForm',
    id:           'verbFormSelector',
    title:        'Verb Forms',
    description:  'Identify the grammatical person of each verb, then find its root to build stronger Arabic morphology intuition.',
    buttonId:     'playVerbFormBtn',
    fontFamily:   "'Roboto', sans-serif",
    fontSize:     '1rem',
    textAlign:    'center',
    disabled:     !GAME_FLAGS.enableVerbFormGame,
  },
];

export const GAME_CONFIG = {
  maxLives:            10,
  dailyBonusPoints:    10,
  correctActionPoints: 1,
  fullGameBonus:       5,
  wrongActionPenalty:  5,

  selectors: {
    learnSection:       '#main-grammar-section',
    translationSection: '#translation-section',
    gameContainer:      '#game-mode-content',
    mainGrammarSection: '#main-grammar-section',
    bottomNav:          '.bottom-nav'
  },
  games: RAW_GAMES
};

export function getEnabledGames() {
  return GAME_CONFIG.games.filter(game => !game.disabled);
}

export function isGameEnabled(type) {
  return getEnabledGames().some(game => game.type === type);
}
