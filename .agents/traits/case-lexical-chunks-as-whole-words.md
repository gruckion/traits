---
name: case-lexical-chunks-as-whole-words
subject: Word chunks in project-owned identifiers and matching filenames,
  including project-defined schema keys and tagged-union tags even when
  serialized. Excludes externally defined protocol values and API names, and
  prose in strings or comments (e.g. "API key", "OAuth").
assertion: Treat a lexical term as a single word chunk when composing
  identifiers, even when it is an abbreviation or conventionally has internal
  capitals. Apply PascalCase or camelCase at word-chunk boundaries instead of
  preserving special capitalization inside a chunk. For the oauth chunk, use
  OauthAttempt, OauthAttemptStatus, and oauthAttempt rather than OAuthAttempt,
  OAuthAttemptStatus, or oAuthAttempt. Use the same casing in matching
  filenames, such as OauthAttempt.ts.
purpose: Keep compound identifier names consistently word-based rather than
  carrying special acronym capitalization.
---
Correct (already whole-word chunks): `ApiKey`, `apiKey`, `ApiKey.ts`, `OauthAttempt`.

Out of scope: prose such as `"Enter your API key"` or `// OAuth flow`; externally defined values such as an HTTP header `"X-API-Key"` or a provider's `"oauth_token"` field.

Violations: `APIKey`, `apiKEY`, `OAuthAttempt`, and project-defined tags or keys:

```diff
-S.TaggedUnion({ OAuth: S.Struct({}), ApiKey: S.Struct({}) })
+S.TaggedUnion({ Oauth: S.Struct({}), ApiKey: S.Struct({}) })
```
