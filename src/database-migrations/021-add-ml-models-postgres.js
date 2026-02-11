// src/database-migrations/021-add-ml-models-postgres.js
// PostgreSQL migration: ml_models table for ML Signal Combiner

async function migrate(db) {
  console.log('📊 Creating ml_models table for PostgreSQL...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS ml_models (
      id SERIAL PRIMARY KEY,
      model_name TEXT NOT NULL,
      model_type TEXT NOT NULL,
      horizon_days INTEGER,
      model_data TEXT,
      feature_importances TEXT,
      training_samples INTEGER,
      validation_metrics TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(model_name, model_type)
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_ml_models_name_type ON ml_models(model_name, model_type)
  `);

  console.log('✅ ml_models table ready');
}

module.exports = { migrate };
