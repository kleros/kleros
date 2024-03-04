const Configuration = {
  /*
   * Resolve and load @commitlint/config-conventional from node_modules.
   * Referenced packages must be installed
   */
  extends: ["@commitlint/config-conventional"],
  /*
   * Any rules defined here will override rules from @commitlint/config-conventional
   */
  rules: {
    "body-leading-blank": [2, "always"],
    "footer-leading-blank": [2, "always"],
  },
  /*
   * Custom URL to show upon failure
   */
  helpUrl: "https://github.com/conventional-changelog/commitlint/#what-is-commitlint",
};

module.exports = Configuration;
