---
name: effect-crypto-services
subject: Cryptographic operations in Effect application code.
assertion: Use Effect’s injectable Crypto service for supported cryptographic
  operations instead of importing node:crypto. Use Effect encoding utilities for
  digest representations when available.
purpose: Keep cryptographic dependencies injectable, testable, and portable
  across Effect runtimes.
---
