'use strict';

/**
 * Scanner corpus extractor — drives the reference checkout (../Main)
 * `lib/scan.js` over a fixed set of scanner inputs/options and writes
 * `scan_oracle.json`. Run BEFORE verifying:
 *   node fixtures/extract-scan.js
 *
 * The corpus is the acceptance oracle; it is regenerated only when the
 * reference or the input set changes. Double-regeneration must be
 * byte-identical (determinism).
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const REF = path.join(__dirname, '..', '..', 'Main');
const scan = require(path.join(REF, 'lib', 'scan'));

const { enc, encOptions } = require('./canon-scan');

// --- canonical state encoding (mirrors scan-bridge.js decState inverse)
function canonState(s) {
  const out = {
    prefix: enc(s.prefix),
    input: enc(s.input),
    start: s.start,
    base: enc(s.base),
    glob: enc(s.glob),
    isBrace: s.isBrace === true,
    isBracket: s.isBracket === true,
    isGlob: s.isGlob === true,
    isExtglob: s.isExtglob === true,
    isGlobstar: s.isGlobstar === true,
    negated: s.negated === true,
    negatedExtglob: s.negatedExtglob === true,
  };
  if (s.tokens !== undefined) {
    out.tokens = s.tokens.map(function (t) {
      const tk = { value: enc(t.value), isGlob: t.isGlob === true };
      if (t.depth !== undefined) tk.depth = t.depth;
      if (t.backslashes === true) tk.backslashes = true;
      if (t.isBrace === true) tk.isBrace = true;
      if (t.isBracket === true) tk.isBracket = true;
      if (t.isExtglob === true) tk.isExtglob = true;
      if (t.isGlobstar === true) tk.isGlobstar = true;
      if (t.negated === true) tk.negated = true;
      if (t.isPrefix === true) tk.isPrefix = true;
      return tk;
    });
    out.maxDepth = s.maxDepth;
  }
  if (s.slashes !== undefined) out.slashes = s.slashes.slice();
  if (s.parts !== undefined) out.parts = s.parts.map(enc);
  return out;
}

// --- the input set (covers all api.scan.js cases + option interactions +
//     adversarial edges). Seeded for determinism.
const inputs = [
  // plain / non-glob
  '', '.', 'a', '.a', '/a', 'a/', '/a/', '/a/b/c', 'a/b/c/', 'a.min.js',
  'a/.x.md', 'a/b/.gitignore', 'a/b/c/d.md', 'a/b/c/d.e.f/g.min.js',
  'a/b/.git', 'a/b/.git/', 'a/b/c', 'a/b/c.d/e.md', 'a/b/c.md', 'aa', 'ab',
  'bb', 'c.md', 'foo', 'path', 'path/foo', 'path/foo/', 'path/foo/bar.js',
  // leading ./ and ! and ./!
  './foo/bar/*.js', './foo', '../foo', '!foo/bar/*.js', './!foo/bar/*.js',
  '!./foo/bar/*.js', './(a|b)',
  // stars / globstars / qmarks
  '*', '*/', '*/*', '*/*/', '**', '**/', '**/*', '**/*/', '/*.js', '*.js',
  '**/*.js', '/root/path/to/*.js', 'foo/bar*', 'a/**/j/**/z/*.md',
  'a/**/z/*.md', 'node_modules/*-glob/**/*.js', '.a*', '.b*', '/*',
  'a/***', 'a/**/b/*.{foo,bar}', 'a/**/c/*', 'a/**/c/*.md', 'a/**/e',
  'a/**c*', 'a/**c/*', 'a/*/*/e', 'a/*/c/*.md', 'a/b/**/c{d,e}/**/xyz.md',
  'a/b/**/e', 'a/b/*.{foo,bar}', 'a/b/*/e', 'a/b/.git/', 'a/b/.git/**',
  'a/b/.{foo,bar}', 'a/b/c/*', 'a/b/c/**/*.min.js', 'a/b/c/*.md',
  'a/b/c/.*.md', 'a/b/{c,.gitignore,{a,b}}/{a,b}/abc.foo.js',
  'a/b/{c,/.gitignore}', 'a/b/{c,d}/', 'a/b/{c,d}/e/f.g', 'b/*/*/*',
  '?', '?/?', '??', '???', '?a', '?b', 'a?b', 'a/?/c.js', 'a/?/c.md',
  'a/?/c/?/*/f.js', 'a/?/c/?/*/f.md', 'a/?/c/?/e.js', 'a/?/c/?/e.md',
  'a/?/c/???/e.js', 'a/?/c/???/e.md', 'a/??/c.js', 'a/??/c.md', 'a/???/c.js',
  'a/???/c.md', 'a/????/c.js',
  // brackets
  '[a-z]', '[bar]', '[bar]/', './\\[bar]', '\\[bar]/', '\\[bar\\]/',
  '[bar\\]/', 'path/foo \\[bar]/', '\\[bar]', '[bar\\]', 'foo/[a-b].min.js',
  '[a-c]b*', '[a-j]*[^c]', '[a-j]*[^c]b/c', '[a-j]*[^c]bc', '[ab][ab]',
  'path/[a-z]', 'js/t[a-z]st}/*.js', 'chapter/foo [bar]/',
  'path/\\*\\*/subdir/foo.*', 'path/\\[\\*\\]/subdir/foo.*',
  'path/\\[foo bar\\]/subdir/foo.*', 'path/\\[bar]/', 'path/\\[bar]',
  // braces
  '{a,b}', '/{a,b}', '/{a,b}/', 'path/{to,from}', 'path/{foo,bar}/',
  'js/{src,test}/*.js', 'js/test{0..9}/*.js', '{.,*}',
  '/a/b/{c,/foo.js}/e.f.g/', '{a/b/c.js,/a/b/{c,/foo.js}/e.f.g/}',
  '/a/b/{c,d}/', '/a/b/{c,d}/*.js', '/a/b/{c,d}/*.min.js',
  '/a/b/{c,d}/e.f.g/', 'a/b/.{c,.gitignore}', 'a/b/.{c,/.gitignore}',
  'a/b/.{foo,bar}', 'a/b/{c,.gitignore}', 'a/b/{c,/.gitignore}',
  'a/b/{c,/gitignore}', 'a/b/{c,d}', 'a/b/{c,./d}/e/f.g',
  'a/b/{c,./d}/e/f.min.g',
  'a/b/{c,.gitignore,{a,./b}}/{a,b}/abc.foo.js',
  'a/b/{c,.gitignore,{a,b}}/{a,b}/*.foo.js',
  'a/b/{c,.gitignore,{a,b}}/{a,b}/abc.foo.js', 'a/b/{c,/d}/e/f.g',
  'a/b/{c,/d}/e/f.min.g', 'a/b/{c,d}/', 'a/b/{c,d}/*.js',
  'a/b/{c,d}/*.min.js', 'a/b/{c,d}/e.f.g/', 'a/b/{c,d}/e/f.g',
  'a/b/{c,d}/e/f.min.g', 'foo/{a,b}.min.js', 'one/{foo,bar}/**/{baz,qux}/*.txt',
  'two/baz/**/{abc,xyz}/*.js', 'foo/{bar,baz}/**/aaa/{bbb,ccc}',
  'a/b/.{c,.gitignore}', '{a/b/{c,/foo.js}/e.f.g}', '.md',
  // extglobs
  '!(foo)*', '!(foo)', 'test/!(foo)/*', './foo/@(foo)/*.js',
  './foo/@(bar)/**/*.js', '/a/b/!(a|b)/e.f.g/', '/a/b/@(a|b)/e.f.g/',
  '@(a|b)/e.f.g/', 'path/!(to|from)', 'path/*(to|from)', 'path/+(to|from)',
  'path/?(to|from)', 'path/@(to|from)', 'js/t+(wo|est)/*.js',
  'js/t(wo|est)/*.js', 'js/t/(wo|est)/*.js', '(a|b)', 'foo/(a|b)',
  '/(a|b)', 'a/(b c)', 'foo/(b c)/baz', 'a/(b c)/', 'a/(b c)/d',
  'path/(foo bar)/subdir/foo.*', 'path/(foo/bar|baz)', 'path/(foo/bar|baz)/',
  'path/(to|from)', 'path/\\(foo/bar|baz)/', 'path/\\*(a|b)',
  'path/\\*(a|b)/subdir/foo.*', 'path/\\*/(a|b)/subdir/foo.*',
  'path/\\*\\(a\\|b\\)/subdir/foo.*',
  // negation
  '!foo', '!*.min.js', '!foo/*.js', '!foo/(a|b).min.js',
  '!foo/[a-b].min.js', '!foo/{a,b}.min.js', 'a/b/c/!foo',
  'path/!/foo', 'path/!/foo/', 'path/!subdir/foo.js', 'path/**/*',
  'path/**/subdir/foo.*', 'path/*/foo', 'path/*/foo/', 'path/+/foo',
  'path/+/foo/', 'path/?/foo', 'path/?/foo/', 'path/@/foo', 'path/@/foo/',
  'path/[a-z]', 'path/subdir/**/foo.js', 'path/to/*.js',
  // windows backslash globs
  'C:\\path\\*.js', 'C:\\\\path\\\\*.js', 'C:\\\\path\\*.js',
  // BMP non-ASCII (api.scan.js L360)
  'フォルダ/**/*',
  // astral (emoji)
  '😀/*', '😀/**',
  // parts / tokens combos
  'foo/!(abc)', 'c/!(z)/v', 'c/@(z)/v', 'foo/(bar|baz)', 'foo/(bar|baz)*',
  '**/*(W*, *)*', 'a/**@(/x|/z)/*.md', 'foo/(bar|baz)/*.js',
  'XXX/*/*/12/*/*/m/*/*', 'foo/\\"**\\"/bar', '[0-9]/[0-9]',
  'foo/[0-9]/[0-9]', 'foo[0-9]/bar[0-9]',
  // escaped braces (unescape option)
  '\\{foo,bar\\}', '\\{foo,bar\\}/', '\\{foo,bar}/', 'path/\\{foo,bar}/',
  'path/{,/,bar/baz,qux}/', 'path/\\{,/,bar/baz,qux}/',
  'path/\\{,/,bar/baz,qux\\}/', '/{,/,bar/baz,qux}/',
  '/\\{,/,bar/baz,qux}/', '{,/,bar/baz,qux}', '\\{,/,bar/baz,qux\\}',
  '\\{,/,bar/baz,qux}/', '\\{../,./,\\{bar,/baz},qux}',
  '\\{../,./,\\{bar,/baz},qux}/', 'path/\\{,/,bar/{baz,qux}}/',
  'path/\\{../,./,\\{bar,/baz},qux}/',
  'path/\\{../,./,{bar,/baz},qux}/',
  'path/{,/,bar/\\{baz,qux}}/',
];

const optionCombos = [
  {}, // default
  { parts: true },
  { scanToEnd: true },
  { tokens: true },
  { noext: true },
  { nonegate: true },
  { noparen: true },
  { unescape: true },
  { parts: true, unescape: true },
  { tokens: true, unescape: true },
  { parts: true, noext: true },
  { scanToEnd: true, nonegate: true },
];

const cases = [];
let id = 0;
for (const input of inputs) {
  for (const opts of optionCombos) {
    const s = scan(input, opts);
    cases.push({
      id: 'scan.' + id++,
      input: enc(input),
      options: encOptions(opts),
      expect: { kind: 'ok', state: canonState(s) },
    });
  }
}

const doc = {
  meta: {
    reference: REF,
    tool: 'fixtures/extract-scan.js',
    indexUnits: 'utf16_code_unit',
    count: cases.length,
  },
  cases: cases,
};

const outPath = path.join(__dirname, 'scan_oracle.json');
fs.writeFileSync(outPath, JSON.stringify(doc, null, 1) + '\n');
const sha = crypto
  .createHash('sha256')
  .update(fs.readFileSync(outPath))
  .digest('hex');
console.log(
  'extract-scan: ' +
    cases.length +
    ' cases, corpus sha256 ' +
    sha.slice(0, 12) +
    '…'
);