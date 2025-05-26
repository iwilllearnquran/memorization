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
      type:         'comingSoon',
      // Placeholder for a future game
      id:           'comingSoonSelector',
      // This is a placeholder for a future game
      title:        'Coming Soon',
      description:  'More practice games are on the way! Stay tuned for more ways to learn and practice Quranic Arabic',
      //buttonId:     'comingSoonBtn',
      fontFamily:   "'Roboto', sans-serif",
      fontSize:     '1rem',
      textAlign:    'center',
      disabled:     true,  // Optional: Use this flag in your UI logic to skip r
    },

    // …add more games here…
  ]
};
