'use strict';

/**
 * adapter/lib/scan.js — `scan()` surface backed by `pmx --serve`.
 * Mirrors the fields of reference/lib/scan.js and its option semantics.
 */

const { bridge } = require('../_bridge');

function scan(input, options) {
  const a = bridge('scan', input, options);
  const state = {
    prefix: a.prefix,
    input: a.input,
    start: a.start,
    base: a.base,
    glob: a.glob,
    isBrace: a.isBrace,
    isBracket: a.isBracket,
    isGlob: a.isGlob,
    isExtglob: a.isExtglob,
    isGlobstar: a.isGlobstar,
    negated: a.negated,
    negatedExtglob: a.negatedExtglob
  };

  if (a.tokens !== null && a.tokens !== undefined) {
    state.maxDepth = a.maxDepth;
    state.tokens = a.tokens.map(t => {
      const tok = { value: t.value, isGlob: t.isGlob };
      if (t.depth !== null && t.depth !== undefined) tok.depth = t.depth === 'Infinity' ? Infinity : t.depth;
      if (t.backslashes !== null) tok.backslashes = t.backslashes;
      if (t.isBrace !== null) tok.isBrace = t.isBrace;
      if (t.isBracket !== null) tok.isBracket = t.isBracket;
      if (t.isExtglob !== null) tok.isExtglob = t.isExtglob;
      if (t.isGlobstar !== null) tok.isGlobstar = t.isGlobstar;
      if (t.negated !== null) tok.negated = t.negated;
      if (t.isPrefix !== null && t.isPrefix !== undefined) tok.isPrefix = t.isPrefix;
      return tok;
    });
  }

  if (a.slashes !== null && a.slashes !== undefined) state.slashes = a.slashes;
  if (a.parts !== null && a.parts !== undefined) state.parts = a.parts;

  return state;
}

module.exports = scan;
