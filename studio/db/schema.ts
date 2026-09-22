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
  price: text('price').notNull().default(''), specification: text('specification').notNull().default(''),
  applicable: text('applicable').notNull().default(''), effect: text('effect').notNull().default(''),
  usageNotes: text('usage_notes').notNull().default(''), precautions: text('precautions').notNull().default(''),
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
  customerId: text('customer_id'),
  audience: text('audience').notNull(), scene: text('scene').notNull(),
  messages: text('messages').notNull(), reply: text('reply'), nextStep: text('next_step'),
  followups: text('followups'), resources: text('resources'), supplement: text('supplement'),
  salutation: text('salutation'), needs: text('needs'), goal: text('goal'), instruction: text('instruction'),
  status: text('status').notNull(), feedback: text('feedback'), createdAt: integer('created_at').notNull(),
});

export const customers = sqliteTable('studio_customers', {
  id: text('id').primaryKey(), displayName: text('display_name').notNull(), audience: text('audience').notNull(),
  ownerUserId: text('owner_user_id').notNull(), salutation: text('salutation').notNull().default(''),
  phoneSuffix: text('phone_suffix').notNull().default(''), purchasedProducts: text('purchased_products').notNull().default(''),
  interests: text('interests').notNull().default(''), concerns: text('concerns').notNull().default(''),
  contraindications: text('contraindications').notNull().default(''), notes: text('notes').notNull().default(''),
  active: integer('active').notNull().default(1), updatedBy: text('updated_by').notNull(), updatedAt: integer('updated_at').notNull(),
});

export const issues = sqliteTable('studio_issues', {
  id: text('id').primaryKey(), generationId: text('generation_id').notNull(), userId: text('user_id').notNull(),
  reason: text('reason').notNull(), note: text('note').notNull().default(''), screenshot: text('screenshot'),
  status: text('status').notNull().default('open'), createdAt: integer('created_at').notNull(),
});

export const juziBots = sqliteTable('studio_juzi_bots', {
  imBotId: text('im_bot_id').primaryKey(), botName: text('bot_name').notNull().default(''),
  ownerUserId: text('owner_user_id'), lastSyncedAt: integer('last_synced_at').notNull(),
});

export const juziContacts = sqliteTable('studio_juzi_contacts', {
  id: text('id').primaryKey(), imContactId: text('im_contact_id').notNull().unique(),
  externalUserId: text('external_user_id').notNull().default(''), displayName: text('display_name').notNull().default(''),
  phoneSuffix: text('phone_suffix').notNull().default(''), gender: integer('gender').notNull().default(0),
  imBotId: text('im_bot_id').notNull(), friendshipStatus: integer('friendship_status').notNull().default(0),
  localCustomerId: text('local_customer_id'), matchStatus: text('match_status').notNull().default('unmatched'),
  lastSyncedAt: integer('last_synced_at').notNull(),
  tags: text('tags').notNull().default(''), remark: text('remark').notNull().default(''),
  profileJson: text('profile_json'), lastProfileUpdatedAt: integer('last_profile_updated_at'),
});

export const outreachTasks = sqliteTable('studio_outreach_tasks', {
  id: text('id').primaryKey(), contactId: text('contact_id').notNull(), localCustomerId: text('local_customer_id'),
  audience: text('audience').notNull(), priority: text('priority').notNull().default('medium'),
  reason: text('reason').notNull().default(''), recommendedMessage: text('recommended_message').notNull().default(''),
  nextAction: text('next_action').notNull().default(''), stopRule: text('stop_rule').notNull().default(''),
  status: text('status').notNull().default('draft'), createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(), planDay: text('plan_day').notNull().default(''),
  strategyType: text('strategy_type').notNull().default('care'), profileSnapshot: text('profile_snapshot'),
  profileUpdates: text('profile_updates'),
});

export const outreachMessages = sqliteTable('studio_outreach_messages', {
  id: text('id').primaryKey(), taskId: text('task_id'), contactId: text('contact_id').notNull(),
  direction: text('direction').notNull(), content: text('content').notNull(), requestId: text('request_id'),
  externalRequestId: text('external_request_id').unique(), messageId: text('message_id').unique(),
  status: text('status').notNull().default('pending'), error: text('error').notNull().default(''),
  createdAt: integer('created_at').notNull(),
});

export const customerProfileUpdates = sqliteTable('studio_customer_profile_updates', {
  id: text('id').primaryKey(), contactId: text('contact_id').notNull(),
  localCustomerId: text('local_customer_id'), messageId: text('message_id'),
  updatesJson: text('updates_json').notNull(), createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
});
