---
name: dedicated-shared-cli-flags
subject: CLI flag groups reused by multiple commands.
assertion: Keep shared CLI flag groups in a dedicated shared module, with a
  descriptive export such as commonFlags, rather than defining and exporting
  them from a specific command implementation.
purpose: Make shared flag ownership clear and avoid coupling commands through
  implementation modules.
---
