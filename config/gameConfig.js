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
  }, games: [
    {
      type:         'arrange',
      id:           'arrangeSelector',
      title:        'Arrange Words',
      description:  'Build the full verse by matching the words — using the English meaning or your memory',
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
      description:  'Verbs and their roots make up ~20% of Quranic vocabulary. Match the verbs to their meanings in English',
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
      description:  'Identify each word as Verb (فعل), Noun (اسم), or Particle (حرف) — the three pillars of Arabic grammar',
      buttonId:     'playWordTypeBtn',
      fontFamily:   "'Roboto', sans-serif",
      fontSize:     '1rem',
      textAlign:    'center',
      disabled:     false,
    },

    {
      type:         'verbForm',
      id:           'verbFormSelector',
      title:        'Verb Forms',
      description:  'Identify the grammatical person of each verb, then find its root — master Arabic صرف (morphology)',
      buttonId:     'playVerbFormBtn',
      fontFamily:   "'Roboto', sans-serif",
      fontSize:     '1rem',
      textAlign:    'center',
      disabled:     false,
    },

    // …add more games here…
  ]
};
