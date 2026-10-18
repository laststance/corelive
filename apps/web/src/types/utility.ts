export type ConvertDateToString<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends object
      ? ConvertDateToString<Exclude<T[K], Date>>
      : T[K]
}
