---
name: colocate-task-command-implementations
subject: Commands in a repository's task CLI and functionality specific to those
  commands.
assertion: Keep each task CLI command's entry point and command-specific
  implementation modules together within the task CLI's source directory.
  Functionality shared elsewhere in the repository may remain in its appropriate
  shared location.
purpose: Keep command ownership clear and make task implementations easy to
  discover without duplicating shared functionality.
---
