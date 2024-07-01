export type TODO = any

// https://stackoverflow.com/a/69288824/8440230
export type Expand<T> = T extends (...args: infer A) => infer R
  ? (...args: Expand<A>) => Expand<R>
  : T extends infer O
    ? { [K in keyof O]: O[K] }
    : never

export type ConvertDateToString<T> = {
  [K in keyof T]: K extends 'createdAt' | 'updatedAt' ? string : T[K]
}
