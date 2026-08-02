'use strict';

/**
 * adapter/lib/utils.js — pure-JS port of reference/lib/utils.js.
 *
 * These helpers are language-level string math, not the compiler's product;
 * reproducing them here costs one file and keeps `require('../lib/utils')`
 * semantics exact without subprocess overhead. The compiler's emotional
 * center (parse/scan output) still flows from Rust through _bridge.
 */

const REGEX_SPECIAL_CHARS = /[-*+?.^${}(|)[\]]/;
const REGEX_SPECIAL_CHARS_GLOBAL = /([-*+?.^${}(|)[\]])/g;
const REGEX_BACKSLASH = /\\(?![*+?^${}(|)[\]])/g;
const REGEX_REMOVE_BACKSLASH = /(?:\[.*?[^\\]\]|\\(?=.))/g;

exports.isObject = val => val !== null && typeof val === 'object' && !Array.isArray(val);
exports.hasRegexChars = str => REGEX_SPECIAL_CHARS.test(str);
exports.isRegexChar = str => str.length === 1 && exports.hasRegexChars(str);
exports.escapeRegex = str => str.replace(REGEX_SPECIAL_CHARS_GLOBAL, '\\$1');
exports.toPosixSlashes = str => str.replace(REGEX_BACKSLASH, '/');

exports.isWindows = () => {
  if (typeof navigator !== 'undefined' && navigator.platform) {
    const platform = navigator.platform.toLowerCase();
    return platform === 'win32' || platform === 'windows';
  }
  if (typeof process !== 'undefined' && process.platform) {
    return process.platform === 'win32';
  }
  return false;
};

exports.removeBackslashes = str => {
  return str.replace(REGEX_REMOVE_BACKSLASH, match => {
    return match === '\\' ? '' : match;
  });
};

exports.escapeLast = (input, char, lastIdx) => {
  const idx = input.lastIndexOf(char, lastIdx);
  if (idx === -1) return input;
  if (input[idx - 1] === '\\') return exports.escapeLast(input, char, idx - 1);
  return `${input.slice(0, idx)}\\${input.slice(idx)}`;
};

exports.removePrefix = (input, state = {}) => {
  let output = input;
  if (output.startsWith('./')) {
    output = output.slice(2);
    state.prefix = './';
  }
  return output;
};

exports.wrapOutput = (input, state = {}, options = {}) => {
  const prepend = options.contains ? '' : '^';
  const append = options.contains ? '' : '$';

  let output = `${prepend}(?:${input})${append}`;
  if (state.negated === true) {
    output = `(?:^(?!${output}).*$)`;
  }
  return output;
};

exports.basename = (path, { windows } = {}) => {
  const segs = path.split(windows ? /[\\/]/ : '/');
  const last = segs[segs.length - 1];

  if (last === '') {
    return segs[segs.length - 2];
  }

  return last;
};
