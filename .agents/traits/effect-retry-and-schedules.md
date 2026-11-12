---
name: effect-retry-and-schedules
subject: Retry and backoff behavior in Effect programs. Applies when adding
  retry or backoff behavior to Effect operations. In TypeScript or TSX files.
assertion: 'Never manually implement retry or backoff logic. Use Effect’s
  built-in retry and scheduling APIs when retries are warranted:
  `request.pipe(Effect.retry({ times: 3, while: isTransient, schedule:
  Schedule.exponential("100 millis") }))`, not a retry loop with sleeps. Apply
  retries conservatively, with bounded attempts and appropriate failure
  filtering.'
purpose: Keep retries bounded and composable while avoiding bespoke timing and
  attempt-management logic.
---
```diff
-for (let attempt = 0; attempt < 3; attempt++) { /* retry request and sleep manually */ }
+const retried = request.pipe(Effect.retry({ times: 3, while: isTransient, schedule: Schedule.exponential("100 millis") }))
```
