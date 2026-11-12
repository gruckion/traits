---
name: separate-validation-from-test-scripts
subject: Package scripts for repository validation and test execution.
assertion: Use check for the aggregate validation pipeline, including
  formatting/lint/type checks, builds and applicable tests. Keep test:* scripts
  limited to executing the named test suite or mode, without implicitly running
  unrelated validation or builds; use colon-qualified suffixes to identify the
  suite and mode.
purpose: Allow targeted tests to run independently without repeatedly paying
  full validation and build costs.
---
