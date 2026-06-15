-- ShipRag: Create all missing tables referenced by API routes

-- 1. port_data (港口数据)
CREATE TABLE IF NOT EXISTS port_data (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  port_code varchar(50) UNIQUE,
  name_cn varchar(255),
  name_en varchar(255),
  lat float8,
  lon float8,
  ctry_name_cn varchar(255),
  ctry_code varchar(10),
  region varchar(100),
  embedding vector(1536),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_port_data_code ON port_data(port_code);
CREATE INDEX IF NOT EXISTS idx_port_data_ctry ON port_data(ctry_code);

-- 2. route_data (航线数据)
CREATE TABLE IF NOT EXISTS route_data (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  route_code varchar(50) UNIQUE,
  name_cn varchar(255),
  name_en varchar(255),
  geometry_wkt text,
  start_port_code varchar(50),
  end_port_code varchar(50),
  distance_km float8,
  embedding vector(1536),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_route_data_code ON route_data(route_code);

-- 3. port_name_mappings (港口名称映射)
CREATE TABLE IF NOT EXISTS port_name_mappings (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  port_code varchar(50),
  name_type varchar(50),
  name_cn varchar(255),
  name_en varchar(255),
  alias jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_port_name_mappings_code ON port_name_mappings(port_code);

-- 4. user_roles (用户角色)
CREATE TABLE IF NOT EXISTS user_roles (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar(255),
  role varchar(50) DEFAULT 'user',
  permissions jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);

-- 5. trajectories (航迹主表)
CREATE TABLE IF NOT EXISTS trajectories (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  ship_name varchar(255),
  mmsi varchar(50),
  imo varchar(50),
  call_sign varchar(50),
  ship_type varchar(100),
  flag_country varchar(100),
  start_time timestamptz,
  end_time timestamptz,
  point_count int DEFAULT 0,
  source_file varchar(500),
  status varchar(20) DEFAULT 'pending',
  embedding vector(1536),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_trajectories_mmsi ON trajectories(mmsi);
CREATE INDEX IF NOT EXISTS idx_trajectories_status ON trajectories(status);

-- 6. trajectory_segments (航段表)
CREATE TABLE IF NOT EXISTS trajectory_segments (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  trajectory_id varchar(36) REFERENCES trajectories(id) ON DELETE CASCADE,
  segment_index int,
  start_time timestamptz,
  end_time timestamptz,
  start_lat float8,
  start_lon float8,
  end_lat float8,
  end_lon float8,
  avg_speed float8,
  max_speed float8,
  distance_km float8,
  duration_min float8,
  wkt_route text,
  sea_area varchar(255),
  ai_description text,
  behavior_label varchar(100),
  intent_label varchar(100),
  embedding vector(1536),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_traj_seg_traj_id ON trajectory_segments(trajectory_id);
CREATE INDEX IF NOT EXISTS idx_traj_seg_behavior ON trajectory_segments(behavior_label);
CREATE INDEX IF NOT EXISTS idx_traj_seg_intent ON trajectory_segments(intent_label);

-- 7. segment_behaviors (航段行为标注)
CREATE TABLE IF NOT EXISTS segment_behaviors (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id varchar(36),
  trajectory_id varchar(36),
  behavior_type varchar(100) NOT NULL,
  behavior_label varchar(100),
  confidence float8,
  annotated_by varchar(255),
  annotation_time timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_seg_behavior_seg ON segment_behaviors(segment_id);
CREATE INDEX IF NOT EXISTS idx_seg_behavior_type ON segment_behaviors(behavior_type);

-- 8. segment_intents (航段意图标注)
CREATE TABLE IF NOT EXISTS segment_intents (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id varchar(36),
  trajectory_id varchar(36),
  intent_type varchar(100) NOT NULL,
  intent_label varchar(100),
  confidence float8,
  annotated_by varchar(255),
  annotation_time timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_seg_intent_seg ON segment_intents(segment_id);
CREATE INDEX IF NOT EXISTS idx_seg_intent_type ON segment_intents(intent_type);

-- 9. trajectory_labels (航迹标签)
CREATE TABLE IF NOT EXISTS trajectory_labels (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  trajectory_id varchar(36),
  segment_id varchar(36),
  label_type varchar(50),
  label_value varchar(255),
  label_source varchar(50),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_traj_label_traj ON trajectory_labels(trajectory_id);

-- 10. trajectory_training_data (训练数据)
CREATE TABLE IF NOT EXISTS trajectory_training_data (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  trajectory_id varchar(36),
  segment_id varchar(36),
  features jsonb DEFAULT '{}'::jsonb,
  behavior_label varchar(100),
  intent_label varchar(100),
  split_type varchar(20) DEFAULT 'train',
  fold int DEFAULT 0,
  weight float8 DEFAULT 1.0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_train_data_traj ON trajectory_training_data(trajectory_id);
CREATE INDEX IF NOT EXISTS idx_train_data_split ON trajectory_training_data(split_type);

-- 11. trajectory_model_versions (模型版本)
CREATE TABLE IF NOT EXISTS trajectory_model_versions (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name varchar(100) NOT NULL,
  model_type varchar(50) NOT NULL,
  model_path varchar(500),
  metrics jsonb DEFAULT '{}'::jsonb,
  training_config jsonb DEFAULT '{}'::jsonb,
  status varchar(20) DEFAULT 'training',
  is_active boolean DEFAULT false,
  training_time_seconds float8,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_model_version_status ON trajectory_model_versions(status);

-- 12. trajectory_training_jobs (训练任务)
CREATE TABLE IF NOT EXISTS trajectory_training_jobs (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name varchar(255),
  job_type varchar(50),
  model_version_id varchar(36),
  status varchar(20) DEFAULT 'pending',
  progress float8 DEFAULT 0,
  config jsonb DEFAULT '{}'::jsonb,
  result jsonb DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

-- 13. trajectory_clusters (聚类结果)
CREATE TABLE IF NOT EXISTS trajectory_clusters (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id int,
  cluster_name varchar(255),
  trajectory_id varchar(36),
  distance_to_center float8,
  algorithm varchar(50),
  parameters jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cluster_id ON trajectory_clusters(cluster_id);

-- 14. trajectory_anomaly_samples (异常样本)
CREATE TABLE IF NOT EXISTS trajectory_anomaly_samples (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  trajectory_id varchar(36),
  segment_id varchar(36),
  anomaly_type varchar(100),
  anomaly_score float8,
  description text,
  is_corrected boolean DEFAULT false,
  correction_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

-- 15. auto_research_experiments (自动研究实验)
CREATE TABLE IF NOT EXISTS auto_research_experiments (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255),
  description text,
  config jsonb DEFAULT '{}'::jsonb,
  status varchar(20) DEFAULT 'pending',
  result jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

-- 16. auto_research_iterations (实验迭代)
CREATE TABLE IF NOT EXISTS auto_research_iterations (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id varchar(36),
  iteration_index int,
  config jsonb DEFAULT '{}'::jsonb,
  result jsonb DEFAULT '{}'::jsonb,
  status varchar(20) DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- 17. auto_research_models (研究模型)
CREATE TABLE IF NOT EXISTS auto_research_models (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id varchar(36),
  model_name varchar(255),
  model_type varchar(50),
  config jsonb DEFAULT '{}'::jsonb,
  metrics jsonb DEFAULT '{}'::jsonb,
  status varchar(20) DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

-- 18. conversation_contexts (对话上下文)
CREATE TABLE IF NOT EXISTS conversation_contexts (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id varchar(255) NOT NULL,
  context_type varchar(50) DEFAULT 'rag',
  context_data jsonb DEFAULT '{}'::jsonb,
  tokens_used int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_context_session ON conversation_contexts(session_id);

-- 19. vectorize_tasks (向量化任务)
CREATE TABLE IF NOT EXISTS vectorize_tasks (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type varchar(50) NOT NULL,
  source_id varchar(36),
  status varchar(20) DEFAULT 'pending',
  error_message text,
  priority int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_vec_task_status ON vectorize_tasks(status);

-- 20. workflows (工作流)
CREATE TABLE IF NOT EXISTS workflows (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  description text,
  workflow_type varchar(50),
  nodes jsonb DEFAULT '[]'::jsonb,
  edges jsonb DEFAULT '[]'::jsonb,
  config jsonb DEFAULT '{}'::jsonb,
  is_published boolean DEFAULT false,
  version int DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO eonl;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon;
