-- Create models table for storing 3D model information
CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  file_type TEXT,
  price REAL DEFAULT 0,
  category TEXT DEFAULT 'other',
  tags TEXT,                    -- JSON array format: '["furniture","modern"]'
  created_by TEXT DEFAULT 'GM', -- Creator/uploader
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster searches
CREATE INDEX IF NOT EXISTS idx_models_name ON models(name);
CREATE INDEX IF NOT EXISTS idx_models_created_at ON models(created_at);
CREATE INDEX IF NOT EXISTS idx_models_category ON models(category);
CREATE INDEX IF NOT EXISTS idx_models_price ON models(price);
CREATE INDEX IF NOT EXISTS idx_models_created_by ON models(created_by);

