/**
 * Unwraps the one row an `INSERT`/`UPDATE`/`DELETE … RETURNING` must produce, throwing when the statement matched nothing.
 *
 * The former ORM's `update`, `delete` and `findUniqueOrThrow` raised `P2025` when no row matched;
 * drizzle silently returns `[]`. Call sites that relied on the throw route through this helper
 * so a vanished row still aborts the surrounding transaction / reaches the catch clause.
 *
 * @param rows - The array a drizzle `.returning()` (or a limited select) resolved to.
 * @param operation - Short description used in the error message, e.g. `'category.update'`.
 * @returns The first row.
 * @throws {Error} When `rows` is empty (the statement affected no row).
 * @example
 * const row = requireRow(
 *   await db.delete(todoTable).where(eq(todoTable.id, 1)).returning(),
 *   'todo.delete',
 * )
 */
export function requireRow<Row>(rows: readonly Row[], operation: string): Row {
  const [row] = rows
  if (row === undefined) throw new Error(`${operation} matched no row`)
  return row
}
