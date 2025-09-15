-- VizCad Initial Database Schema
-- Clean D1 + R2 Architecture

CREATE TABLE models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    file_url TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT NOT NULL,
    file_key TEXT NOT NULL UNIQUE,
    price REAL DEFAULT 0.0,
    category TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    created_by TEXT DEFAULT 'Anonymous',
    thumbnail_url TEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    download_count INTEGER DEFAULT 0,
    is_featured INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active'
);

-- Create indexes for better performance
CREATE INDEX idx_models_category ON models(category);
CREATE INDEX idx_models_price ON models(price);
CREATE INDEX idx_models_status ON models(status);
CREATE INDEX idx_models_is_featured ON models(is_featured);
CREATE INDEX idx_models_created_at ON models(created_at DESC);
CREATE INDEX idx_models_file_key ON models(file_key);
