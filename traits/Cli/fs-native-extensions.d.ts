declare module "fs-native-extensions" {
  /** Attempts an exclusive advisory lock on the open file description without blocking. */
  export const tryLock: (fd: number) => boolean
}
