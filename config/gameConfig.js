export const GAME_CONFIG = {
  maxLives:            10,
  dailyBonusPoints:    10,
  correctActionPoints: 10,
  fullGameBonus:       20,
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
      description:  'Drag the words to build the correct sentence in Arabic',
      buttonId:     'playArrangeBtn',
      fontFamily:   "'Roboto', sans-serif",
      fontSize:     '1rem',
      textAlign:    'center',
    },
    {
      type:         'verb',
      id:           'verbSelector',
      title:        'Verb Match',
      description:  'Match Arabic verbs to their English meanings',
      buttonId:     'playVerbBtn',
      fontFamily:   "'Roboto', sans-serif",
      fontSize:     '1rem',
      textAlign:    'center',
    },

    // …add more games here…
  ]
};
