/**
 * commitlint — enforces Conventional Commits at commit time.
 *
 * Pairs with .husky/commit-msg which already runs a regex check. This
 * adds the standard rule set + scope vocabulary so future Changesets
 * (M5+) reads consistent metadata from history.
 */
const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'refactor',
        'docs',
        'test',
        'chore',
        'style',
        'perf',
        'build',
        'ci',
        'revert',
      ],
    ],
    'subject-case': [0],
    'subject-max-length': [2, 'always', 100],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};

export default config;
