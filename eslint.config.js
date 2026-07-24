// eslint.config.js — flat config for ESLint v10+
// package.json has no "type": "module" so this file is treated as CommonJS
"use strict";

module.exports = [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },
];
