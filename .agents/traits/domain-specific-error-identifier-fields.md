---
name: domain-specific-error-identifier-fields
subject: Domain identifiers carried in JavaScript error payloads.
assertion: Use domain-specific payload field names, such as traitName, instead
  of name when identifying the domain entity involved in an error. Preserve
  Error.name for the error type rather than shadowing it with domain data.
purpose: Keep error diagnostics accurate and identifier meaning explicit.
---
