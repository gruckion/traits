---
name: source-redaction-over-heuristic-scrubbing
subject: Secret handling and error diagnostic formatting.
assertion: Wrap known secret values in Redacted at their source and prefer
  standard library error formatting over bespoke recursive formatters and
  speculative secret-pattern scrubbing. Add custom sanitization only for a
  concrete unmet requirement; do not assume source redaction protects secrets
  already unwrapped into arbitrary third-party error messages.
purpose: Keep diagnostic handling simple while protecting known secrets at the
  boundary where their sensitivity is understood.
---
