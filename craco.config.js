module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      const oneOfRule = webpackConfig.module.rules.find(
        (rule) => rule.oneOf !== undefined
      );

      if (oneOfRule) {
        const dependencyBabelRule = oneOfRule.oneOf.find(
          (rule) =>
            typeof rule.loader === 'string' &&
            rule.loader.includes('babel-loader') &&
            rule.test !== undefined &&
            rule.test.toString().includes('mjs') &&
            rule.exclude !== undefined
        );

        if (dependencyBabelRule) {
          // Skip Babel transpilation for .mjs files inside node_modules.
          // These files are already valid modern ESM that the browserslist
          // targets support, and running them through CRA's dependency
          // Babel preset produces "Missing transform" errors (e.g. docx/fast-png).
          dependencyBabelRule.test = /\.(js|jsx)$/;
        }
      }

      return webpackConfig;
    },
  },
  jest: {
    configure: (jestConfig) => {
      jestConfig.moduleNameMapper = {
        ...jestConfig.moduleNameMapper,
        '^react-markdown$': '<rootDir>/src/__mocks__/react-markdown.js',
        '^remark-gfm$': '<rootDir>/src/__mocks__/remark-gfm.js',
        '^docx$': '<rootDir>/src/__mocks__/docx.js',
      };
      return jestConfig;
    },
  },
};
