/** Jest config (ts-jest) - unit tests for pure logic (dedup, ranking, normalization). */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  // Integration tests drive the live dev server over HTTP (~20 sequential
  // requests for the IDOR isolation case); 5s default is not a real signal.
  testTimeout: 60000,
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { esModuleInterop: true, target: "ES2022" } }],
    // @exodus/bytes (jsdom dep of isomorphic-dompurify) ships ESM .js - convert to CJS.
    "^.+\\.m?js$": ["ts-jest", { tsconfig: { esModuleInterop: true, target: "ES2022" }, isolateModules: false }],
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(@exodus/bytes|parse5|entities|@asamuzakjp|@csstools|css-tree|mdn-data)/)",
  ],
};
