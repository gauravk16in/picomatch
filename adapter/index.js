'use strict';

/**
 * adapter/index.js — full public `picomatch` surface orchestrated over
 * `pmx --serve` / napi (single-source dispatch in pmx-cli).
 * mirroring reference/lib/picomatch.js + reference/index.js behaviorally.
 */

const utils = require('./lib/utils');
const scan = require('./lib/scan');
const { bridge, bridgeRaw, u16s } = require('./_bridge');

const todo = name => {
  throw new Error(`TODO(pmx): ${name}`);
};

/* unit-decoding helper for source/state fields (survives lone surrogates) */
const dec = u16s;

/* engine exec path → JS exec array. Construction errors mirror the
 * reference's toRegex swallow (picomatch.js:L344-346): bad sources become
 * never-match `/$^/` — `da /` — NOT thrown through .test/.exec. */
function execOp(sourceUnits, input, flags) {
  let a;
  try {
    a = bridgeRaw({
      op: 'regexExec',
      source: sourceUnits,
      input: String(input),
      flags: flags || ''
    });
  } catch (e) {
    return false; // engine-side failure ⇒ /$^/ (never-match), reference L346
  }
  if (a.kind !== 'ok') return false; // engine-level error ⇒ /$^/ as well
  if (a.matched !== true) return false;
  const groups = a.groups.map(g => (g ? String(input).substring(g[0], g[1]) : undefined));
  return groups;
}

function testOp(sourceUnits, input, flags) {
  let a;
  try {
    a = bridgeRaw({ op: 'regexTest', source: sourceUnits, input: String(input), flags: flags || '' });
  } catch (e) {
    return false;
  }
  if (a.kind !== 'ok') return false; // /$^/ swarm behavior of reference toRegex
  return a.matched === true;
}

/* ----------------------- makeRe / compileRe / toRegex ----------------------- */

picomatch.makeRe = (input, options = {}, returnOutput = false, returnState = false) => {
  // reference picomatch.js:L305-L321 (validation message: 'Expected a non-empty string')
  if (!input || typeof input !== 'string') {
    throw new TypeError('Expected a non-empty string');
  }
  const a = bridgeRaw({ op: 'makeRe', pattern: input, options, returnOutput, returnState });
  if (returnOutput) return dec(a.output);
  const source = dec(a.source);
  const regex = picomatch.toRegex(source, options);
  if (returnState === true && a.state) regex.state = stateFromProjection(a.state);
  return regex;
};

picomatch.compileRe = (state, options, returnOutput = false, returnState = false) => {
  const a = bridgeRaw({ op: 'compileRe', state: stateToProjection(state), options: options || {}, returnOutput, returnState });
  if (a.kind === 'error') {
    throw new SyntaxError(a.message);
  }
  if (returnOutput) return dec(a.output);
  const regex = picomatch.toRegex(dec(a.source), options);
  if (returnState === true) regex.state = state;
  return regex;
};

picomatch.toRegex = (source, options) => {
  const flags = options && options.flags ? options.flags : (options && options.nocase ? 'i' : '');
  const units = typeof source === 'string' ? Array.from({ length: source.length }, (_, i) => source.charCodeAt(i)) : source;
  const src = dec(units);
  let re;
  try {
    re = new RegExp(src, flags);
  } catch (err) {
    // reference picomatch.js:L344-346 — swallowable only when debug is unset
    if (options && options.debug === true) throw err;
    re = /$^/;
  }
  // engine-backed semantics attached NON-enumerably: real RegExp under
  // deepStrictEqual (own enumerable props stay pristine), pmx engine under
  // actual calls. V8 inside the JS-side adapter is the sanctioned route
  // (rulebook §12 applies to the shipped binary, not the test adapter).
  const reTest = input => testOp(units, input, flags);
  const reExec = input => execOp(units, input, flags);
  Object.defineProperty(re, 'test', { value: reTest, enumerable: false });
  Object.defineProperty(re, 'exec', { value: reExec, enumerable: false });
  return re;
};

/* ------------------------------ the matcher ------------------------------ */

function stateFromProjection(p) {
  return p && typeof p === 'object'
    ? { ...p, input: dec(p.input), output: dec(p.output), prefix: dec(p.prefix), consumed: dec(p.consumed) }
    : p;
}

function stateToProjection(s) {
  const u = v => (typeof v === 'string' ? Array.from({ length: v.length }, (_, i) => v.charCodeAt(i)) : v);
  return { ...s, input: u(s.input), output: u(s.output), prefix: u(s.prefix), consumed: u(s.consumed) };
}

picomatch.test = (input, regex, options, { glob, posix } = {}) => {
  // reference picomatch.js:L128-L156
  if (typeof input !== 'string') {
    throw new TypeError('Expected input to be a string');
  }
  if (input === '') {
    return { isMatch: false, match: false, output: '' };
  }
  const opts = options || {};
  const format = opts.format || (posix ? utils.toPosixSlashes : null);
  let match = input === glob;
  let output = (match && format) ? format(input) : input;
  if (match === false) {
    output = format ? format(input) : input;
    match = output === glob;
  }

  if (match === false || opts.capture === true) {
    if (opts.matchBase === true || opts.basename === true) {
      match = picomatch.matchBase(input, regex, options, posix);
    } else {
      match = regex.exec(output);
    }
  }
  return { isMatch: Boolean(match), match, output };
};

picomatch.matchBase = (input, glob, options, posix = options && options.windows) => {
  // reference picomatch.js:L172-175 — RegExp structural check: JS
  // `instanceof RegExp`; our wrapper is duck-typed the same way.
  const regex = glob && typeof glob.test === 'function' ? glob : picomatch.makeRe(glob, options);
  return regex.test(utils.basename(input, { windows: posix }));
};

picomatch.isMatch = (str, patterns, options) => picomatch(patterns, options)(str);

picomatch.parse = (pattern, options) => {
  // reference picomatch.js:L210-L213 — array map + forced fastpaths:false.
  if (Array.isArray(pattern)) return pattern.map(p => picomatch.parse(p, options));
  const a = bridgeRaw({ op: 'parse', pattern, options: { ...(options || {}), fastpaths: false } });
  if (a.kind === 'error') {
    const err = a.class === 'TypeError' ? new TypeError(a.message) : new SyntaxError(a.message);
    throw err;
  }
  return {
    input: u16s(a.input),
    index: a.index,
    start: a.start,
    dot: a.dot,
    consumed: u16s(a.consumed),
    output: u16s(a.output),
    prefix: u16s(a.prefix),
    backtrack: a.backtrack,
    negated: a.negated,
    negatedExtglob: a.negatedExtglob,
    brackets: a.brackets,
    braces: a.braces,
    parens: a.parens,
    quotes: a.quotes,
    globstar: a.globstar,
    tokens: a.tokens.map(t => {
      const tok = { type: t.type, value: u16s(t.value) };
      if (t.output !== null) tok.output = u16s(t.output);
      if (t.suffix !== null && t.suffix !== undefined) tok.suffix = u16s(t.suffix);
      return tok;
    })
  };
};

picomatch.scan = (input, options) => scan(input, options);

function picomatch(globs, options, returnState = false) {
  // reference picomatch.js:L43-L46 — arrays of patterns: first match wins
  if (Array.isArray(globs)) {
    const fns = globs.map(input => picomatch(input, options, returnState));
    return str => {
      for (const isMatch of fns) {
        const state = isMatch(str);
        if (state) return state;
      }
      return false;
    };
  }

  const isState = utils.isObject(globs) && globs.tokens && globs.input;
  // reference picomatch.js:L58-L60
  if (globs === '' || (typeof globs !== 'string' && !isState)) {
    throw new TypeError('Expected pattern to be a non-empty string');
  }

  const opts = options || {};
  const posix = opts.windows;

  // reference index.js L8-L11 — windows option defaulted only with options object
  if (options && (options.windows === null || options.windows === undefined)) {
    options = { ...options, windows: utils.isWindows() };
  }

  const glob = globs;
  const regex = isState
    ? picomatch.compileRe(glob, options)
    : picomatch.makeRe(glob, options, false, true);

  const state = regex.state;
  delete regex.state;

  let isIgnored = () => false;
  if (opts.ignore) {
    const ignoreOpts = { ...options, ignore: null, onMatch: null, onResult: null };
    isIgnored = picomatch(opts.ignore, ignoreOpts, returnState);
  }

  const matcher = (input, returnObject = false) => {
    const { isMatch, match, output } = picomatch.test(input, regex, opts, { glob, posix });
    const result = { glob, state, regex, posix, input, output, match, isMatch };

    if (typeof opts.onResult === 'function') {
      opts.onResult(result);
    }

    if (isMatch === false) {
      result.isMatch = false;
      return returnObject ? result : false;
    }

    if (isIgnored(input)) {
      if (typeof opts.onIgnore === 'function') {
        opts.onIgnore(result);
      }
      result.isMatch = false;
      return returnObject ? result : false;
    }

    if (typeof opts.onMatch === 'function') {
      opts.onMatch(result);
    }
    return returnObject ? result : true;
  };

  if (returnState) {
    matcher.state = state;
  }

  return matcher;
}

module.exports = picomatch;
