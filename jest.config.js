/** Jest config (ts-jest) - unit tests for pure logic (dedup, ranking, normalization). */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  transform: { "^.+\\.tsx?$": ["ts-jest", { tsconfig: { esModuleInterop: true, target: "ES2022" } }] },
};
