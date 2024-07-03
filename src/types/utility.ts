export type TODO = any

// https://stackoverflow.com/a/69288824/8440230
export type Expand<T> = T extends (...args: infer A) => infer R
  ? (...args: Expand<A>) => Expand<R>
  : T extends infer O
    ? { [K in keyof O]: O[K] }
    : never
export type ConvertDateToString<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends object
      ? ConvertDateToString<Exclude<T[K], Date>>
      : T[K]
}
export type TransformDateToString<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Array<infer U>
      ? Array<TransformDateToString<U>>
      : T[K] extends object
        ? TransformDateToString<T[K]>
        : T[K]
}
