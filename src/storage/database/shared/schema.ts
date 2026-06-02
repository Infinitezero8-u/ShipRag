import { pgTable, serial, timestamp, varchar, text, jsonb, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"


export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 知识库条目表 - 存储所有模态的知识数据
export const knowledgeItems = pgTable(
	"knowledge_items",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		modality: varchar("modality", { length: 20 }).notNull(), // 'text' | 'image' | 'excel' | 'doc' | 'md' | 'json' | 'trajectory'
		title: varchar("title", { length: 255 }),
		content: text("content"), // 原始内容或描述
		source: varchar("source", { length: 500 }), // 来源文件名或URL
		metadata: jsonb("metadata"), // 额外元数据（标签、作者、时间等）
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("knowledge_items_modality_idx").on(table.modality),
		index("knowledge_items_created_at_idx").on(table.created_at),
	]
);

// 文件上传记录表
export const fileUploads = pgTable(
	"file_uploads",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		filename: varchar("filename", { length: 255 }).notNull(),
		file_type: varchar("file_type", { length: 50 }).notNull(), // 'excel' | 'doc' | 'md' | 'json' | 'image'
		file_size: text("file_size").notNull(),
		storage_url: varchar("storage_url", { length: 500 }), // 对象存储URL
		status: varchar("status", { length: 20 }).notNull().default("processing"), // 'processing' | 'completed' | 'failed'
		item_count: text("item_count").default("0"), // 解析出的条目数
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("file_uploads_status_idx").on(table.status),
		index("file_uploads_created_at_idx").on(table.created_at),
	]
);
