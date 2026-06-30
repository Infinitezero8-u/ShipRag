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

// ═════════════════════════════════════════
// Data Center tables (2026-06-17)
// ═════════════════════════════════════════

export const seaAreas = pgTable("sea_areas", {
	id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
	name: varchar("name", { length: 255 }).notNull(),
	seaType: varchar("sea_type", { length: 100 }),
	bounds: jsonb("bounds").default({}),
	metadata: jsonb("metadata").default({}),
	knowledgeItemId: varchar("knowledge_item_id", { length: 36 }),
	embeddingStatus: varchar("embedding_status", { length: 20 }).notNull().default("pending"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("sea_areas_name_idx").on(table.name),
	index("sea_areas_type_idx").on(table.seaType),
]);

export const eezBoundaries = pgTable("eez_boundaries", {
	id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
	country: varchar("country", { length: 255 }).notNull(),
	areaSqkm: varchar("area_sqkm", { length: 50 }),
	bounds: jsonb("bounds").default({}),
	metadata: jsonb("metadata").default({}),
	knowledgeItemId: varchar("knowledge_item_id", { length: 36 }),
	embeddingStatus: varchar("embedding_status", { length: 20 }).notNull().default("pending"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("eez_country_idx").on(table.country),
]);

export const bridgeInventory = pgTable("bridge_inventory", {
	id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
	stateCode: varchar("state_code", { length: 3 }),
	structureNumber: varchar("structure_number", { length: 25 }),
	routePrefix: varchar("route_prefix", { length: 10 }),
	routeNumber: varchar("route_number", { length: 20 }),
	facilityCarried: text("facility_carried"),
	location: text("location"),
	lat: varchar("lat", { length: 20 }),
	lon: varchar("lon", { length: 20 }),
	yearBuilt: varchar("year_built", { length: 4 }),
	yearReconstructed: varchar("year_reconstructed", { length: 4 }),
	structureLengthM: varchar("structure_length_m", { length: 20 }),
	maxSpanLengthM: varchar("max_span_length_m", { length: 20 }),
	deckWidthM: varchar("deck_width_m", { length: 20 }),
	rawFields: jsonb("raw_fields").notNull().default({}),
	knowledgeItemId: varchar("knowledge_item_id", { length: 36 }),
	importSource: varchar("import_source", { length: 100 }),
	embeddingStatus: varchar("embedding_status", { length: 20 }).notNull().default("pending"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("bridge_state_idx").on(table.stateCode),
	index("bridge_location_idx").on(table.lat, table.lon),
]);

export const safetyIncidents = pgTable("safety_incidents", {
	id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
	occurrenceId: varchar("occurrence_id", { length: 100 }),
	source: varchar("source", { length: 50 }).notNull().default("maib"),
	localDate: varchar("local_date", { length: 50 }),
	severity: varchar("severity", { length: 50 }),
	mainEventL1: varchar("main_event_l1", { length: 200 }),
	mainEventL2: varchar("main_event_l2", { length: 200 }),
	shortDescription: text("short_description"),
	description: text("description"),
	lat: varchar("lat", { length: 50 }),
	lon: varchar("lon", { length: 50 }),
	vesselName: varchar("vessel_name", { length: 255 }),
	vesselType: varchar("vessel_type", { length: 100 }),
	portAccident: varchar("port_accident", { length: 255 }),
	coastalState: varchar("coastal_state", { length: 100 }),
	stateReporting: varchar("state_reporting", { length: 100 }),
	rawFields: jsonb("raw_fields").notNull().default({}),
	knowledgeItemId: varchar("knowledge_item_id", { length: 36 }),
	importSource: varchar("import_source", { length: 100 }),
	embeddingStatus: varchar("embedding_status", { length: 20 }).notNull().default("pending"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("safety_severity_idx").on(table.severity),
	index("safety_date_idx").on(table.localDate),
	index("safety_source_idx").on(table.source),
]);

export const imdgGoods = pgTable("imdg_goods", {
	id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
	unClass: varchar("un_class", { length: 5 }),
	goodsName: varchar("goods_name", { length: 100 }),
	division: varchar("division", { length: 20 }),
	classification: text("classification"),
	knowledgeItemId: varchar("knowledge_item_id", { length: 36 }),
	embeddingStatus: varchar("embedding_status", { length: 20 }).notNull().default("pending"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const freightIndices = pgTable("freight_indices", {
	id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
	indexName: varchar("index_name", { length: 100 }).notNull(),
	collectionTime: varchar("collection_time", { length: 50 }),
	source: varchar("source", { length: 255 }),
	data: jsonb("data").notNull().default({}),
	knowledgeItemId: varchar("knowledge_item_id", { length: 36 }),
	embeddingStatus: varchar("embedding_status", { length: 20 }).notNull().default("pending"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("freight_idx_name_idx").on(table.indexName),
]);

export const aisSynopses = pgTable("ais_synopses", {
	id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
	vesselIdHash: varchar("vessel_id_hash", { length: 100 }).notNull(),
	timestampUnixMs: varchar("timestamp_unix_ms", { length: 20 }),
	lon: varchar("lon", { length: 20 }),
	lat: varchar("lat", { length: 20 }),
	heading: varchar("heading", { length: 20 }),
	speed: varchar("speed", { length: 20 }),
	annotations: jsonb("annotations").default([]),
	transportTrail: jsonb("transport_trail").default([]),
	sourceFile: varchar("source_file", { length: 500 }),
	knowledgeItemId: varchar("knowledge_item_id", { length: 36 }),
	embeddingStatus: varchar("embedding_status", { length: 20 }).notNull().default("pending"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("ais_syn_vessel_idx").on(table.vesselIdHash),
	index("ais_syn_source_idx").on(table.sourceFile),
]);

export const shipImages = pgTable("ship_images", {
	id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
	filename: varchar("filename", { length: 500 }).notNull(),
	timestampStr: varchar("timestamp_str", { length: 50 }),
	lon: varchar("lon", { length: 20 }),
	lat: varchar("lat", { length: 20 }),
	localPath: varchar("local_path", { length: 1000 }).notNull(),
	knowledgeItemId: varchar("knowledge_item_id", { length: 36 }),
	importSource: varchar("import_source", { length: 100 }),
	embeddingStatus: varchar("embedding_status", { length: 20 }).notNull().default("pending"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("ship_img_location_idx").on(table.lon, table.lat),
]);

export const importProgress = pgTable("import_progress", {
	id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
	module: varchar("module", { length: 50 }).notNull(),
	sourceFile: varchar("source_file", { length: 500 }).notNull(),
	totalRows: varchar("total_rows", { length: 20 }),
	processedRows: varchar("processed_rows", { length: 20 }).notNull().default("0"),
	status: varchar("status", { length: 20 }).notNull().default("pending"),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
	index("import_progress_module_idx").on(table.module),
	index("import_progress_status_idx").on(table.status),
]);
