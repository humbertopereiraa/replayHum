/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript' },
          target: 'es2022',
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',
    '!src/types.ts',
    '!src/test/**',
    '!src/**/*.test.ts',
  ],
};
