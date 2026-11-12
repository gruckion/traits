---
name: avoid-package-script-aliases-for-task-commands
subject: Package scripts for commands already exposed through a repository task CLI.
assertion: Invoke task CLI subcommands through the existing tasks script rather
  than adding redundant package-script aliases for individual subcommands.
purpose: Keep package scripts minimal and maintain one discoverable entry point
  for repository tasks.
---
