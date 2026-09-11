import {sqliteTable,text,integer,uniqueIndex,index} from 'drizzle-orm/sqlite-core';
export const alerts=sqliteTable('alerts',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),conditionKey:text('condition_key').notNull(),payload:text('payload').notNull(),enabled:integer('enabled').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),checkToken:text('check_token'),checkUntil:integer('check_until').notNull().default(0),lastAttempt:integer('last_attempt').notNull().default(0),
},t=>[uniqueIndex('alerts_user_condition').on(t.userId,t.conditionKey),index('alerts_user').on(t.userId)]);
export const snapshots=sqliteTable('snapshots',{
 alertId:text('alert_id').primaryKey().references(()=>alerts.id,{onDelete:'cascade'}),userId:text('user_id').notNull(),state:text('state').notNull(),checkedAt:text('checked_at').notNull(),
});
export const notifications=sqliteTable('notifications',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),alertId:text('alert_id').notNull().references(()=>alerts.id,{onDelete:'cascade'}),eventKey:text('event_key').notNull(),payload:text('payload').notNull(),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('notifications_user_event').on(t.userId,t.eventKey),index('notifications_user_time').on(t.userId,t.createdAt)]);
