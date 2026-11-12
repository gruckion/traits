import { Config, Context, Effect, Equal, FileSystem, Layer, Option, Path, Schema as S, String } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

/** Kind of filesystem entry expected at an owner-only storage path. */
type UserFileType = typeof UserFileType.Type
const UserFileType = S.Literals(["Directory", "File"]).annotate({
  description: "Kind of filesystem entry expected at an owner-only storage path."
})

/** Owner-only storage could not be established, so the path is refused rather than read or written. */
export class UserFileSecurityError extends S.TaggedError<UserFileSecurityError>()("UserFileSecurityError", {
  /** Storage path refused because owner-only access could not be guaranteed. */
  path: S.String.annotateKey({
    description: "Storage path refused because owner-only access could not be guaranteed."
  }),
  /** Entry type the path was required to be; a mismatch, such as a symlink, is refused. */
  type: UserFileType.annotateKey({
    description: "Entry type the path was required to be; a mismatch, such as a symlink, is refused."
  }),
  /**
   * Failed check: Entry when the path is the wrong type, has a foreign owner, or is a hard-linked file;
   * WindowsAcl when ownership, reparse-point absence, or an owner-only ACL could not be verified.
   */
  check: S.Literals(["Entry", "WindowsAcl"]).annotateKey({
    description:
      "Failed check: Entry when the path is the wrong type, has a foreign owner, or is a hard-linked file; WindowsAcl when ownership, reparse-point absence, or an owner-only ACL could not be verified."
  })
}) {
  override get message() {
    return this.check === "Entry"
      ? `Refusing unsafe ${this.type} storage at ${this.path}.`
      : `Could not verify ownership, reject reparse points, and enforce an owner-only Windows ACL at ${this.path}.`
  }
}

/** Owner-only local storage. Windows requires PowerShell and an ACL-capable filesystem; fail closed otherwise. */
export class UserFileSecurity extends Context.Service<UserFileSecurity>()("traits/Cli/UserFileSecurity", {
  make: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const windows = process.platform === "win32"
    const uid = process.getuid?.()
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const powershell = windows
      ? yield* Config.String("SystemRoot").pipe(
          Effect.map((root) => path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"))
        )
      : undefined
    return Effect.fn("UserFileSecurity.secure")(function* (filename: string, type: UserFileType) {
      yield* fs.lstat(filename).pipe(
        Effect.filterOrFail(
          (info) =>
            info.type === type &&
            (windows || (uid !== undefined && Option.getOrUndefined(info.uid) === uid)) &&
            (type !== "File" || Option.getOrUndefined(info.nlink) === 1n),
          () => UserFileSecurityError.make({ path: filename, type, check: "Entry" })
        )
      )
      if (powershell === undefined) {
        return yield* fs.chmod(filename, type === "Directory" ? 0o700 : 0o600)
      }
      yield* ChildProcess.make(
        powershell,
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", windowsSecurityScript],
        {
          env: { TRAITS_SECURE_PATH: path.resolve(filename), TRAITS_SECURE_TYPE: type },
          extendEnv: true,
          stdout: "ignore",
          stderr: "ignore"
        }
      ).pipe(
        spawner.exitCode,
        Effect.filterOrFail(Equal.equals(0), () =>
          UserFileSecurityError.make({ path: filename, type, check: "WindowsAcl" })
        )
      )
    })
  })
}) {
  static readonly layer = this.make.pipe(Layer.effect(UserFileSecurity))
}

// Paths are passed as environment data, never interpolated into executable PowerShell.
const windowsSecurityScript = String.stripMargin(`
|$ErrorActionPreference = 'Stop'
|try {
|  $path = $env:TRAITS_SECURE_PATH
|  $directory = $env:TRAITS_SECURE_TYPE -eq 'Directory'
|  $cursor = $path
|  while ($cursor) {
|    $attributes = [System.IO.File]::GetAttributes($cursor)
|    if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse point' }
|    $parent = [System.IO.Path]::GetDirectoryName($cursor)
|    if ($parent -eq $cursor) { break }
|    $cursor = $parent
|  }
|  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
|  $acl = Get-Acl -LiteralPath $path
|  if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'Foreign owner' }
|  if ($directory) {
|    $private = New-Object System.Security.AccessControl.DirectorySecurity
|    $inheritance = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
|  } else {
|    $private = New-Object System.Security.AccessControl.FileSecurity
|    $inheritance = [System.Security.AccessControl.InheritanceFlags]::None
|  }
|  $private.SetOwner($sid)
|  $private.SetAccessRuleProtection($true, $false)
|  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', $inheritance, 'None', 'Allow')
|  $private.AddAccessRule($rule)
|  Set-Acl -LiteralPath $path -AclObject $private
|  $verified = Get-Acl -LiteralPath $path
|  if (-not $verified.AreAccessRulesProtected) { throw 'Inherited ACL' }
|  if ($verified.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'Foreign owner' }
|  $rules = @($verified.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
|  if ($rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne $sid.Value -or
|      $rules[0].AccessControlType -ne 'Allow' -or
|      $rules[0].FileSystemRights -ne [System.Security.AccessControl.FileSystemRights]::FullControl) { throw 'Unsafe ACL' }
|  if (([System.IO.File]::GetAttributes($path) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse point' }
|  exit 0
|} catch { exit 1 }
`)
