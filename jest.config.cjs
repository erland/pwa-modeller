/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  // Keep tests inside src/ and support both *.test.ts(x) and *.spec.ts(x)
  testMatch: ['<rootDir>/src/**/*.{test,spec}.{ts,tsx}'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.jest.json'
      }
    ]
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
    '\\.(gif|ttf|eot|svg|png|jpg|jpeg|webp)$': '<rootDir>/src/test/fileMock.ts'
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts']
};
