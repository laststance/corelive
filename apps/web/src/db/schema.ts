/**
 * Drizzle schema for CoreLive's PostgreSQL database.
 *
 * Mirrors the tables the original migrations built, byte-for-byte at the DDL
 * level (issue #195: zero DDL on application tables). Table/column/index/FK
 * names and the physical column order are pinned to the live schema so that
 * `pg_dump -s` of the pre-drizzle database and of `pnpm db:migrate` output are
 * identical. Change this file only together with a generated `drizzle/*.sql`.
 *
 * @module db/schema
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * Builds a `timestamp(3)` column that Node reads and writes as a UTC `Date`.
 *
 * Every timestamp column in this schema is `timestamp(3) without time zone`
 * holding UTC wall-clock values, exactly what the previous ORM stored. `mode: 'date'`
 * makes the builder layer serialize with `toISOString()` (UTC) so the column
 * never depends on the server's `TZ`.
 *
 * @param name - Physical column name, e.g. `"createdAt"`.
 * @returns A column builder to be finished with `.notNull()` / `.default()`.
 * @example
 * const completedAt = timestampColumn('completedAt') // nullable timestamp(3)
 */
const timestampColumn = (name: string) =>
  timestamp(name, { precision: 3, mode: 'date' })

/**
 * Builds the `createdAt` column: `timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`, stamped in UTC by the app.
 *
 * `CURRENT_TIMESTAMP` (not `now()`) is what the original migrations wrote, and
 * `pg_dump` prints the two differently. The DB default still exists for raw SQL
 * and old rows, but Drizzle's insert path fills the column with `new Date()`
 * first (`$defaultFn` takes precedence and is runtime-only, so `drizzle-kit`
 * sees no DDL change). Without it the DB would cast `CURRENT_TIMESTAMP`
 * (a `timestamptz`) to `timestamp(3)` in the SESSION time zone, shifting every
 * new row by the session's UTC offset on a non-UTC connection; the previous ORM
 * always stamped UTC app-side.
 *
 * @returns A finished, not-null column builder that stamps `new Date()`.
 * @example
 * createdAt: createdAtColumn()
 */
const createdAtColumn = () =>
  timestampColumn('createdAt')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull()
    .$defaultFn(() => new Date())

/**
 * Builds the `updatedAt` column with `@updatedAt`-style semantics (stamped on insert and on every update).
 *
 * The column is `NOT NULL` with no DB default, so `$onUpdate` also fills it on
 * insert (drizzle-orm applies `onUpdateFn` on insert when the column has no
 * default) and on every `update()` / `onConflictDoUpdate()`. Runtime only, no DDL.
 *
 * @returns A finished, not-null column builder that stamps `new Date()`.
 * @example
 * updatedAt: updatedAtColumn()
 */
const updatedAtColumn = () =>
  timestampColumn('updatedAt')
    .notNull()
    .$onUpdate(() => new Date())

export const userTable = pgTable(
  'User',
  {
    id: serial('id').primaryKey(),
    clerkId: text('clerkId').notNull(),
    email: text('email'),
    name: text('name'),
    bio: text('bio'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex('User_clerkId_key').on(table.clerkId),
    uniqueIndex('User_email_key').on(table.email),
  ],
)

export const categoryTable = pgTable(
  'Category',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    userId: integer('userId').notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    // Plain text with no CHECK constraint: a stored color can sit outside the API palette, so readers cast explicitly.
    color: text('color').default('blue').notNull(),
    isDefault: boolean('isDefault').default(false).notNull(),
    parentId: integer('parentId'),
  },
  (table) => [
    uniqueIndex('Category_id_userId_key').on(table.id, table.userId),
    uniqueIndex('Category_root_name_userId_key')
      .on(table.name, table.userId)
      .where(sql`${table.parentId} IS NULL`),
    uniqueIndex('Category_child_name_parent_userId_key')
      .on(table.name, table.parentId, table.userId)
      .where(sql`${table.parentId} IS NOT NULL`),
    index('Category_userId_parentId_idx').on(table.userId, table.parentId),
    check(
      'Category_not_self_parent_check',
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`,
    ),
    check(
      'Category_default_is_root_check',
      sql`NOT ${table.isDefault} OR ${table.parentId} IS NULL`,
    ),
    foreignKey({
      columns: [table.parentId, table.userId],
      foreignColumns: [table.id, table.userId],
      name: 'Category_parent_owner_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userTable.id],
      name: 'Category_userId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ],
)

export const todoTable = pgTable(
  'Todo',
  {
    id: serial('id').primaryKey(),
    text: varchar('text', { length: 255 }).notNull(),
    completed: boolean('completed').default(false).notNull(),
    notes: text('notes'),
    userId: integer('userId').notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    order: integer('order'),
    categoryId: integer('categoryId').notNull(),
    importBatchId: text('importBatchId'),
    completedAt: timestampColumn('completedAt'),
  },
  (table) => [
    index('Todo_categoryId_idx').on(table.categoryId),
    index('Todo_importBatchId_idx').on(table.importBatchId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userTable.id],
      name: 'Todo_userId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categoryTable.id],
      name: 'Todo_categoryId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ],
)

export const completedTable = pgTable(
  'Completed',
  {
    id: serial('id').primaryKey(),
    archived: boolean('archived').default(false).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    userId: integer('userId').notNull(),
    categoryId: integer('categoryId').notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    completedAt: timestampColumn('completedAt'),
    importBatchId: text('importBatchId'),
    localCompletionId: text('localCompletionId'),
  },
  (table) => [
    index('Completed_categoryId_idx').on(table.categoryId),
    index('Completed_importBatchId_idx').on(table.importBatchId),
    uniqueIndex('Completed_userId_localCompletionId_key').on(
      table.userId,
      table.localCompletionId,
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userTable.id],
      name: 'Completed_userId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categoryTable.id],
      name: 'Completed_categoryId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ],
)

export const importBatchTable = pgTable(
  'ImportBatch',
  {
    id: text('id').primaryKey(),
    userId: integer('userId').notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index('ImportBatch_userId_idx').on(table.userId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userTable.id],
      name: 'ImportBatch_userId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
  ],
)

export const electronSettingsTable = pgTable(
  'ElectronSettings',
  {
    id: serial('id').primaryKey(),
    userId: integer('userId').notNull(),
    hideAppIcon: boolean('hideAppIcon').default(false).notNull(),
    showInMenuBar: boolean('showInMenuBar').default(true).notNull(),
    startAtLogin: boolean('startAtLogin').default(false).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex('ElectronSettings_userId_key').on(table.userId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userTable.id],
      name: 'ElectronSettings_userId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ],
)

export const skillTreeTable = pgTable(
  'SkillTree',
  {
    id: serial('id').primaryKey(),
    userId: integer('userId').notNull(),
    name: text('name').notNull(),
    templateKey: text('templateKey'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    // One tree per user: prevents the duplicate-tree race on concurrent first load.
    uniqueIndex('SkillTree_userId_key').on(table.userId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userTable.id],
      name: 'SkillTree_userId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
  ],
)

export const skillNodeTable = pgTable(
  'SkillNode',
  {
    id: serial('id').primaryKey(),
    skillTreeId: integer('skillTreeId').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    icon: text('icon'),
    x: doublePrecision('x').notNull(),
    y: doublePrecision('y').notNull(),
    createdAt: createdAtColumn(),
    // Unlike the other tables this column also has a DB default (part of the live
    // schema captured in drizzle/0000_init.sql), so `$onUpdate` only fires on update;
    // `$defaultFn` stamps insert in UTC for the same reason as {@link createdAtColumn}.
    updatedAt: timestampColumn('updatedAt')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Target of NodeEdge's composite FKs: lets Postgres enforce that both
    // endpoints of an edge live in the edge's own tree.
    uniqueIndex('SkillNode_skillTreeId_id_key').on(table.skillTreeId, table.id),
    index('SkillNode_skillTreeId_idx').on(table.skillTreeId),
    foreignKey({
      columns: [table.skillTreeId],
      foreignColumns: [skillTreeTable.id],
      name: 'SkillNode_skillTreeId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
  ],
)

export const nodeEdgeTable = pgTable(
  'NodeEdge',
  {
    id: serial('id').primaryKey(),
    skillTreeId: integer('skillTreeId').notNull(),
    fromNodeId: integer('fromNodeId').notNull(),
    toNodeId: integer('toNodeId').notNull(),
  },
  (table) => [
    uniqueIndex('NodeEdge_fromNodeId_toNodeId_key').on(
      table.fromNodeId,
      table.toNodeId,
    ),
    index('NodeEdge_skillTreeId_idx').on(table.skillTreeId),
    index('NodeEdge_toNodeId_idx').on(table.toNodeId),
    foreignKey({
      columns: [table.skillTreeId],
      foreignColumns: [skillTreeTable.id],
      name: 'NodeEdge_skillTreeId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
    // Composite FKs use NO ACTION (the default); cascade reaches edges through
    // the SkillTree FK above.
    foreignKey({
      columns: [table.skillTreeId, table.fromNodeId],
      foreignColumns: [skillNodeTable.skillTreeId, skillNodeTable.id],
      name: 'NodeEdge_skillTreeId_fromNodeId_fkey',
    }),
    foreignKey({
      columns: [table.skillTreeId, table.toNodeId],
      foreignColumns: [skillNodeTable.skillTreeId, skillNodeTable.id],
      name: 'NodeEdge_skillTreeId_toNodeId_fkey',
    }),
  ],
)

export const nodeAssignmentTable = pgTable(
  'NodeAssignment',
  {
    id: serial('id').primaryKey(),
    nodeId: integer('nodeId').notNull(),
    // Nullable so the assignment (earned XP) survives after its source Todo is deleted.
    todoId: integer('todoId'),
    createdAt: createdAtColumn(),
    // Snapshot of the Todo text at assignment time; the default only backfills old rows.
    todoText: varchar('todoText', { length: 255 }).default('').notNull(),
  },
  (table) => [
    index('NodeAssignment_nodeId_idx').on(table.nodeId),
    // One assignment per todo, ever; NULLs stay distinct so orphaned rows are fine.
    uniqueIndex('NodeAssignment_todoId_key').on(table.todoId),
    foreignKey({
      columns: [table.nodeId],
      foreignColumns: [skillNodeTable.id],
      name: 'NodeAssignment_nodeId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.todoId],
      foreignColumns: [todoTable.id],
      name: 'NodeAssignment_todoId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ],
)

/** A `User` row as read from the database (the shape `authMiddleware` puts on the oRPC context). */
export type User = typeof userTable.$inferSelect

/** Account-owned deletion receipts let every browser/desktop host rescue its own unsaved draft.
 * Category IDs deliberately have no foreign key: the source has already been deleted.
 */
export const categoryDeletionTable = pgTable(
  'CategoryDeletion',
  {
    id: serial('id').primaryKey(),
    userId: integer('userId')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    sourceId: integer('sourceId').notNull(),
    destinationId: integer('destinationId').notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index('CategoryDeletion_userId_id_idx').on(table.userId, table.id),
    uniqueIndex('CategoryDeletion_sourceId_key').on(table.sourceId),
    check(
      'CategoryDeletion_distinct_categories_check',
      sql`${table.sourceId} > 0 AND ${table.destinationId} > 0 AND ${table.sourceId} <> ${table.destinationId}`,
    ),
  ],
)
