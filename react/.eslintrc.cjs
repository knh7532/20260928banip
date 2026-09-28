module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", "coverage", "public", ".eslintrc.cjs"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["./tsconfig.app.json", "./tsconfig.node.json"],
    tsconfigRootDir: __dirname,
  },
  plugins: ["react-refresh"],
  rules: {
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    "@typescript-eslint/no-explicit-any": "error",
    // 폴링·fetch 코드에서 흔한 실수 차단 (R2 대비)
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    // `_` 접두 인자는 "계약상 받지만 쓰지 않는다"는 뜻으로 이미 코드베이스가 쓰고 있는 관습이다
    // (예: rowLabelOf의 4번째 인자 — 표기 통일로 불필요해졌지만 prop 계약이라 시그니처는 유지).
    // 변수·catch 절은 여전히 걸린다 — 인자와 rest 형제만 면제한다.
    "@typescript-eslint/no-unused-vars": [
      "error",
      { args: "after-used", argsIgnorePattern: "^_", ignoreRestSiblings: true },
    ],
  },
  overrides: [
    {
      // 브라우저 번들에는 Node API가 들어갈 수 없다 (무-Node 정적 배포, ADR R-0004)
      files: ["src/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              { group: ["node:*"], message: "브라우저 번들에 Node API를 넣을 수 없습니다 (ADR R-0004)." },
            ],
            paths: [
              { name: "fs", message: "브라우저 번들에 Node API를 넣을 수 없습니다." },
              { name: "path", message: "브라우저 번들에 Node API를 넣을 수 없습니다." },
            ],
          },
        ],
      },
    },
  ],
};
