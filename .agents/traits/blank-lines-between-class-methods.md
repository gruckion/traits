---
name: blank-lines-between-class-methods
subject: Adjacent method and accessor implementations in classes. In TypeScript,
  TSX, JavaScript, and JSX files.
assertion: Separate adjacent class method implementations with a blank line.
  Apply the same spacing to getters, setters, constructors, and static methods,
  even when the implementations are short.
purpose: Keep class members visually distinct and easy to scan.
---
```ts
get message() {
  return this.description
}

get [CliError.userMessage]() {
  return this.message
}
```