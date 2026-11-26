'use strict';

/** Pruebas de integración: corren contra un PostgreSQL real (ver tests/env.js). */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/env.js'],
  globalSetup: '<rootDir>/tests/globalSetup.js',
  testTimeout: 20000,
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/instrumentation.js'],
  coverageReporters: ['text', 'lcov'],
};
