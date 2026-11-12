---
name: inline-text-encoders-and-decoders
subject: TextEncoder and TextDecoder construction.
assertion: Construct TextEncoder and TextDecoder inline where they are used
  rather than assigning instances to variables, caching them, or reusing them
  across operations.
purpose: Keep text conversion self-contained and avoid unnecessary encoder or
  decoder lifecycle management.
---
```diff
-const encoder = new TextEncoder()
-const bytes = encoder.encode(text)
+const bytes = new TextEncoder().encode(text)
```
