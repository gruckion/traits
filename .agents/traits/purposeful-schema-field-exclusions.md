---
name: purposeful-schema-field-exclusions
subject: Explicit forbidden-field declarations in object schemas and union members.
assertion: Omit fields that do not belong to a variant rather than adding
  optional Never fields solely to reject harmless excess properties. Use
  explicit field exclusions when their absence enforces a concrete contract,
  such as preventing an invalid value from matching another union branch and
  bypassing a required field relationship. Preserve the schema’s normal
  unknown-property handling unless stricter rejection serves such a requirement.
purpose: Keep schemas focused on meaningful valid states without defensive field
  clutter, while retaining exclusions needed for correct union validation.
---
For example, unrelated lifecycle tags do not need target: S.Never.pipe(S.optionalKey) merely because another tag supports target. An ordinary execution branch may need that exclusion when a targeted execution must instead match a recovery branch requiring instructions.