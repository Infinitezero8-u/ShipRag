import { pgTable, serial, timestamp, varchar, text, jsonb, index, boolean } from "drizzle-orm/pg-core"
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

// 规章制度文档分类枚举
export const REGULATION_CATEGORIES = [
	'maritime_rules',      // 海事规章制度
	'platform_ops',        // 平台运维规范
	'trajectory_annotation', // 航迹标注准则
	'model_training',      // 模型训练管理办法
	'other'                // 其他资料
] as const;

export const REGULATION_CATEGORY_LABELS: Record<string, string> = {
	'maritime_rules': '海事规章制度',
	'platform_ops': '平台运维规范',
	'trajectory_annotation': '航迹标注准则',
	'model_training': '模型训练管理办法',
	'other': '其他资料'
};

// 向量化状态枚举
export const VECTOR_STATUS = {
	PENDING: 'pending',      // 未向量化
	SUCCESS: 'success',      // 向量化成功
	FAILED: 'failed'         // 向量化失败
} as const;

// 规章制度文档表
export const regulations = pgTable(
	"regulations",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		filename: varchar("filename", { length: 500 }).notNull(),
		file_type: varchar("file_type", { length: 50 }).notNull(), // 'pdf' | 'doc' | 'docx' | 'txt'
		file_size: text("file_size").notNull(),
		storage_url: varchar("storage_url", { length: 1000 }), // 对象存储URL
		original_content: text("original_content"), // 原文内容
		categories: jsonb("categories").notNull().default([]), // 分类标签数组
		is_valid: boolean("is_valid").notNull().default(true), // 是否生效
		version: varchar("version", { length: 100 }), // 版本号
		publish_date: varchar("publish_date", { length: 50 }), // 发布日期
		publish_org: varchar("publish_org", { length: 255 }), // 发布机构
		description: text("description"), // 文档描述
		vector_status: varchar("vector_status", { length: 20 }).notNull().default("pending"), // 向量化状态
		vector_error: text("vector_error"), // 向量化错误信息
		chunk_count: text("chunk_count").default("0"), // 切片数量
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("regulations_categories_idx").on(table.categories),
		index("regulations_is_valid_idx").on(table.is_valid),
		index("regulations_vector_status_idx").on(table.vector_status),
		index("regulations_created_at_idx").on(table.created_at),
	]
);

// 规章制度切片表 - 存储文档分片及向量
export const regulationChunks = pgTable(
	"regulation_chunks",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		regulation_id: varchar("regulation_id", { length: 36 }).notNull(), // 关联的规章制度ID
		chunk_index: text("chunk_index").notNull(), // 切片序号
		chapter: varchar("chapter", { length: 100 }), // 章节号
		clause: varchar("clause", { length: 100 }), // 条款号
		title: varchar("title", { length: 500 }), // 切片标题
		content: text("content").notNull(), // 切片内容
		metadata: jsonb("metadata"), // 元数据（文档名、分类、生效状态等）
		embedding_status: varchar("embedding_status", { length: 20 }).notNull().default("pending"), // 向量化状态
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("regulation_chunks_regulation_id_idx").on(table.regulation_id),
		index("regulation_chunks_embedding_status_idx").on(table.embedding_status),
	]
);
