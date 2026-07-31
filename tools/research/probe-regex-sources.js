'use strict';
// DISPOSABLE RESEARCH HARNESS (tools/research/) — not part of the port.
// Dumps makeRe() regex sources for representative patterns/options to
// document the exact glob->regex compilation contract of picomatch 4.0.5.
const pm = require('../..');

const out = {};
const cases = {
  star: ['*'],
  qmark: ['?'],
  globstar: ['**'],
  globstar_after_slash: ['a/**'],
  globstar_before_slash: ['**/a'],
  globstar_middle: ['a/**/b'],
  brace: ['{a,b}'],
  brace_range: ['{1..3}'],
  brace_range_alpha: ['{a..z}'],
  bracket: ['[abc]'],
  bracket_neg: ['[!abc]'],
  bracket_range: ['[a-z]'],
  posix_class: ['[[:alpha:]]'],
  extglob_at: ['@(a|b)'],
  extglob_plus: ['+(a|b)'],
  extglob_star: ['*(a|b)'],
  extglob_qmark: ['?(a|b)'],
  extglob_neg: ['!(a|b)'],
  dot_star: ['.*'],
  star_dot: ['*.*'],
  star_slash_star: ['*/*'],
  globstar_slash_star: ['**/*'],
  globstar_slash_star_dot: ['**/*.*'],
  literal: ['foo/bar.js'],
  dot_true: ['*', { dot: true }],
  bash_star: ['*', { bash: true }],
  capture: ['*.js', { capture: true }],
  windows_star: ['*', { windows: true }],
  windows_path: ['a/*', { windows: true }],
  noglobstar: ['**', { noglobstar: true }],
  strictSlashes: ['*', { strictSlashes: true }],
  literalBrackets_true: ['[abc]', { literalBrackets: true }],
  literalBrackets_false: ['[abc]', { literalBrackets: false }],
  regex_true: ['a+(b)', { regex: true }],
  regex_false_plus: ['a+(b)', { regex: false }],
  prepend: ['*.js', { prepend: '(?!)' }],
  unescape: ['a\\\\b', { unescape: true }],
  no_unescape: ['a\\\\b'],
  keepQuotes: ['"a"', { keepQuotes: true }],
  quotes: ['"a"'],
  nobrace: ['{a,b}', { nobrace: true }],
  nobracket: ['[a]', { nobracket: true }],
  nonegate: ['!a', { nonegate: true }],
  noextglob: ['+(a)', { noextglob: true }],
  contains_neg: ['!a', { contains: true }],
  expandRange_custom: ['{1..3}', { expandRange: () => 'RANGE' }],
  strictBrackets_err: ['a[', { strictBrackets: true }],
  unbalanced_bracket: ['a['],
  unbalanced_paren: ['a('],
  unbalanced_brace: ['a{'],
  paren_regex_feature: ['a(?:b)c'],
  extglob_nested_suffix: ['**/!(*.d).ts'],
  double_star_slash: ['a/**/**/b'],
  negated_extglob_star: ['!(*.js)'],
  qmark_after_slash: ['a/?'],
  star_after_dot: ['a.*'],
  triple_star: ['***'],
  star_star_slash_star_star: ['**/**'],
  posix_false: ['[[:alpha:]]', { posix: false }],
  nocase_match: ['*.JS', { nocase: true }]
};

for (const [name, args] of Object.entries(cases)) {
  try {
    const re = pm.makeRe(args[0], args[1]);
    out[name] = { source: re.source, flags: re.flags };
  } catch (e) {
    out[name] = { error: e.constructor.name + ': ' + e.message };
  }
}

// error-message contracts
try { pm.makeRe('a'.repeat(70000)); } catch (e) { out.maxLength_err = e.message; }

// isMatch sanity for a few tricky cases
out.match_samples = {
  'ab vs *': pm.isMatch('ab', '*'),
  '.ab vs *': pm.isMatch('.ab', '*'),
  '.ab vs * dot': pm.isMatch('.ab', '*', { dot: true }),
  'a/b vs *': pm.isMatch('a/b', '*'),
  'a\\b vs * windows': pm.isMatch('a\\b', '*', { windows: true }),
  'a\\b vs * posix-entry': require('../../posix').isMatch('a\\b', '*'),
  'foo vs !(bar)': pm.isMatch('foo', '!(bar)'),
  'bar vs !(bar)': pm.isMatch('bar', '!(bar)'),
  'a.js vs *.!(*a)': pm.isMatch('a.b', '*.!(*a)')
};

console.log(JSON.stringify(out, null, 1));
