'use strict';

const picomatch = require('picomatch');

function toPatterns(patterns) {
  return Array.isArray(patterns) ? patterns : [patterns];
}

function compile(pattern, options) {
  return picomatch(pattern, options);
}

function micromatch(list, patterns, options) {
  const values = Array.isArray(list) ? list : [list];
  const normalized = toPatterns(patterns);
  const positive = normalized.filter((pattern) => !String(pattern).startsWith('!'));
  const negative = normalized
    .filter((pattern) => String(pattern).startsWith('!'))
    .map((pattern) => String(pattern).slice(1));

  return values.filter((value) => {
    const included = positive.length === 0 || positive.some((pattern) => compile(pattern, options)(value));
    const excluded = negative.some((pattern) => compile(pattern, options)(value));
    return included && !excluded;
  });
}

micromatch.isMatch = (value, pattern, options) => compile(pattern, options)(value);
micromatch.matcher = (pattern, options) => compile(pattern, options);
micromatch.match = micromatch;

module.exports = micromatch;
