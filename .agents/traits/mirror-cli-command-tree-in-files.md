---
name: mirror-cli-command-tree-in-files
subject: Source organization of CLI commands and subcommands.
assertion: Mirror the CLI command tree in the file and directory structure under
  the CLI commands directory. Put each command's implementation in its own file
  named for that command; place child command modules in a directory named for
  their parent. Keep parent command modules focused on assembling their
  subcommands, and place shared helpers separately rather than embedding sibling
  command implementations together.
purpose: Make each command discoverable from its invocation path and keep
  command ownership clear.
---
For example, auth.ts assembles auth/list.ts, auth/status.ts, auth/logout.ts, and auth/login.ts; auth/login.ts assembles auth/login/openai.ts and other provider commands.