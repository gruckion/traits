---
name: preserve-nonempty-collection-contracts
subject: Typed interfaces for collections that are guaranteed to contain an element.
assertion: When construction or input validation guarantees a collection is
  nonempty, preserve that guarantee in downstream types using a nonempty
  collection type or a required head plus a remaining-items collection. Avoid
  widening it to a possibly empty array and then adding undefined checks or
  defects solely to recover the lost guarantee. Retain validation at untrusted
  input boundaries.
purpose: Make required elements statically available and avoid redundant runtime
  checks for states excluded by the input contract.
---
