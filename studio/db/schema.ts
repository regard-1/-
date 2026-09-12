import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('studio_users', {
  id: text('id').primaryKey(), username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(), passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(), active: integer('active').notNull().default(1),
  mustChange: integer('must_change').notNull().default(1), createdAt: integer('created_at').notNull(),
});
export const sessions = sqliteTable('studio_sessions', {
  tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull().references(() => users.id),
  csrf: text('csrf').notNull(), expiresAt: integer('expires_at').notNull(),
});
export const rateLimits = sqliteTable('studio_rate_limits', {
  key: text('key').primaryKey(), attempts: integer('attempts').notNull(), expiresAt: integer('expires_at').notNull(),
});
export const materials = sqliteTable('studio_materials', {
  id: text('id').primaryKey(), version: integer('version').notNull(), title: text('title').notNull(),
  kind: text('kind').notNull(), audience: text('audience').notNull(), product: text('product').notNull(),
  content: text('content').notNull(), validFrom: text('valid_from').notNull(), validTo: text('valid_to').notNull(),
  active: integer('active').notNull().default(1), updatedBy: text('updated_by').notNull(), updatedAt: integer('updated_at').notNull(),
});
export const versions = sqliteTable('studio_material_versions', {
  materialId: text('material_id').notNull(), version: integer('version').notNull(),
  snapshot: text('snapshot').notNull(), updatedBy: text('updated_by').notNull(), updatedAt: integer('updated_at').notNull(),
}, table => [primaryKey({ columns: [table.materialId, table.version] })]);
export const budgets = sqliteTable('studio_budgets', {
  month: text('month').primaryKey(), spent: integer('spent').notNull().default(0), reserved: integer('reserved').notNull().default(0),
  ceiling: integer('ceiling').notNull(),
});
export const usage = sqliteTable('studio_usage', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), month: text('month').notNull(),
  audience: text('audience').notNull(), scene: text('scene').notNull(), model: text('model').notNull(),
  status: text('status').notNull(), reservation: integer('reservation').notNull(), cost: integer('cost').notNull().default(0),
  inputTokens: integer('input_tokens'), outputTokens: integer('output_tokens'), elapsedMs: integer('elapsed_ms'),
  feedback: text('feedback'), createdAt: integer('created_at').notNull(),
});

export const conversations = sqliteTable('studio_conversations', {
  id: text('id').primaryKey(), usageId: text('usage_id').notNull(), userId: text('user_id').notNull(),
  audience: text('audience').notNull(), scene: text('scene').notNull(),
  messages: text('messages').notNull(), reply: text('reply'), nextStep: text('next_step'),
  followups: text('followups'), resources: text('resources'), supplement: text('supplement'),
  salutation: text('salutation'), needs: text('needs'), goal: text('goal'), instruction: text('instruction'),
  status: text('status').notNull(), feedback: text('feedback'), createdAt: integer('created_at').notNull(),
});
