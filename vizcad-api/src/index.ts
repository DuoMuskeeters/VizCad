import { Hono } from 'hono'
import { cors } from 'hono/cors'

interface Env {
  DB: D1Database
}

const app = new Hono<{ Bindings: Env }>()

// CORS middleware
app.use('*', cors())

// Health check
app.get('/', (c) => {
  return c.json({ 
    message: 'VizCad API is running!',
    version: '1.0.0',
    endpoints: [
      'GET /api/models - Get all models',
      'GET /api/models/:id - Get model by ID',
      'POST /api/models - Upload new model',
      'PUT /api/models/:id - Update model',
      'DELETE /api/models/:id - Delete model',
      'GET /api/models/category/:category - Get models by category',
      'GET /api/search?q=query - Search models',
      'GET /api/categories - Get all categories',
      'GET /api/stats - Get statistics',
      'GET /thumbnails/:filename - Get thumbnail image'
    ]
  })
})

// Serve thumbnail images (for development)
app.get('/thumbnails/:filename', async (c) => {
  const filename = c.req.param('filename')
  
  // In production, this would serve from R2 or redirect to CDN
  // For now, return a placeholder response
  return c.json({ 
    error: 'Thumbnail serving not implemented in development',
    filename: filename,
    note: 'In production, this would serve the actual image file'
  }, 404)
})

// Get all models
app.get('/api/models', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, name, description, file_url, file_size, file_type, 
             price, category, tags, created_by, thumbnail_url, created_at, updated_at 
      FROM models 
      ORDER BY created_at DESC
    `).all()
    
    return c.json({ 
      success: true,
      count: results.length,
      models: results 
    })
  } catch (error) {
    console.error('Database error:', error)
    return c.json({ 
      success: false,
      error: 'Failed to fetch models' 
    }, 500)
  }
})

// Get single model by ID
app.get('/api/models/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM models WHERE id = ?
    `).bind(id).all()
    
    if (results.length === 0) {
      return c.json({ 
        success: false,
        error: 'Model not found' 
      }, 404)
    }
    
    return c.json({ 
      success: true,
      model: results[0] 
    })
  } catch (error) {
    console.error('Database error:', error)
    return c.json({ 
      success: false,
      error: 'Failed to fetch model' 
    }, 500)
  }
})

// Get models by category
app.get('/api/models/category/:category', async (c) => {
  try {
    const category = c.req.param('category')
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM models 
      WHERE category = ? 
      ORDER BY created_at DESC
    `).bind(category).all()
    
    return c.json({ 
      success: true,
      category: category,
      count: results.length,
      models: results 
    })
  } catch (error) {
    console.error('Database error:', error)
    return c.json({ 
      success: false,
      error: 'Failed to fetch models by category' 
    }, 500)
  }
})

// Search models
app.get('/api/search', async (c) => {
  try {
    const query = c.req.query('q') || ''
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM models 
      WHERE name LIKE ? OR description LIKE ? OR tags LIKE ?
      ORDER BY created_at DESC
    `).bind(`%${query}%`, `%${query}%`, `%${query}%`).all()
    
    return c.json({ 
      success: true,
      query: query,
      count: results.length,
      models: results 
    })
  } catch (error) {
    console.error('Database error:', error)
    return c.json({ 
      success: false,
      error: 'Failed to search models' 
    }, 500)
  }
})

// Create new model (Upload)
app.post('/api/models', async (c) => {
  try {
    // Handle FormData for file upload
    const formData = await c.req.formData()
    
    // Extract fields from FormData
    const name = formData.get('name') as string
    const description = formData.get('description') as string || ''
    const category = formData.get('category') as string
    const price = parseFloat(formData.get('price') as string) || 0
    const tags = formData.get('tags') as string || '[]'
    const created_by = formData.get('created_by') as string || 'Anonymous'
    const file = formData.get('file') as File
    const thumbnail = formData.get('thumbnail') as string || null
    
    // Validate required fields
    if (!name || !category || !file) {
      return c.json({ 
        success: false,
        error: 'Missing required fields: name, category, file' 
      }, 400)
    }
    
    // Get file info
    const file_type = file.name.split('.').pop()?.toLowerCase() || ''
    const file_size = file.size
    
    // Validate file type
    const allowedTypes = ['stl', 'obj', 'ply']
    if (!allowedTypes.includes(file_type)) {
      return c.json({ 
        success: false,
        error: 'Invalid file type. Allowed types: stl, obj, ply' 
      }, 400)
    }
    
    // For now, we'll use a placeholder file URL
    // In production, you'd upload to cloud storage
    const file_url = `/uploads/${Date.now()}-${file.name}`
    
    // Handle thumbnail - for now store base64 directly, in production save as file
    let thumbnail_url = null
    if (thumbnail && thumbnail.startsWith('data:image/')) {
      // For development: store base64 directly in database
      thumbnail_url = thumbnail
      
      // Log the intended filename for production use
      const timestamp = Date.now()
      const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
      const thumbnailFilename = `${sanitizedName}_${timestamp}.png`
      console.log(`Thumbnail received for model: ${name}`)
      console.log(`Would save as: ${thumbnailFilename} in production`)
      console.log(`Base64 length: ${thumbnail.length} chars`)
    }

    // Insert new model
    const { results } = await c.env.DB.prepare(`
      INSERT INTO models (name, description, file_url, file_size, file_type, price, category, tags, created_by, thumbnail_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      RETURNING *
    `).bind(
      name, 
      description, 
      file_url, 
      file_size, 
      file_type, 
      price, 
      category.toLowerCase(), 
      tags, 
      created_by,
      thumbnail_url
    ).all()
    
    return c.json({ 
      success: true,
      message: 'Model uploaded successfully',
      model: results[0]
    }, 201)
  } catch (error) {
    console.error('Database error:', error)
    return c.json({ 
      success: false,
      error: 'Failed to upload model' 
    }, 500)
  }
})

// Update model
app.put('/api/models/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    
    // Check if model exists
    const { results: existing } = await c.env.DB.prepare(`
      SELECT id FROM models WHERE id = ?
    `).bind(id).all()
    
    if (existing.length === 0) {
      return c.json({ 
        success: false,
        error: 'Model not found' 
      }, 404)
    }
    
    const { name, description, file_url, file_size, file_type, price, category, tags } = body
    
    // Build dynamic update query
    const updates = []
    const values = []
    
    if (name !== undefined) { updates.push('name = ?'); values.push(name) }
    if (description !== undefined) { updates.push('description = ?'); values.push(description) }
    if (file_url !== undefined) { updates.push('file_url = ?'); values.push(file_url) }
    if (file_size !== undefined) { updates.push('file_size = ?'); values.push(file_size) }
    if (file_type !== undefined) { updates.push('file_type = ?'); values.push(file_type.toLowerCase()) }
    if (price !== undefined) { updates.push('price = ?'); values.push(price) }
    if (category !== undefined) { updates.push('category = ?'); values.push(category.toLowerCase()) }
    if (tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(tags)) }
    
    updates.push('updated_at = datetime(\'now\')')
    values.push(id)
    
    const { results } = await c.env.DB.prepare(`
      UPDATE models SET ${updates.join(', ')} WHERE id = ? RETURNING *
    `).bind(...values).all()
    
    return c.json({ 
      success: true,
      message: 'Model updated successfully',
      model: results[0]
    })
  } catch (error) {
    console.error('Database error:', error)
    return c.json({ 
      success: false,
      error: 'Failed to update model' 
    }, 500)
  }
})

// Delete model
app.delete('/api/models/:id', async (c) => {
  try {
    const id = c.req.param('id')
    
    // Check if model exists
    const { results: existing } = await c.env.DB.prepare(`
      SELECT id, name FROM models WHERE id = ?
    `).bind(id).all()
    
    if (existing.length === 0) {
      return c.json({ 
        success: false,
        error: 'Model not found' 
      }, 404)
    }
    
    // Delete model
    await c.env.DB.prepare(`
      DELETE FROM models WHERE id = ?
    `).bind(id).run()
    
    return c.json({ 
      success: true,
      message: `Model "${existing[0].name}" deleted successfully`
    })
  } catch (error) {
    console.error('Database error:', error)
    return c.json({ 
      success: false,
      error: 'Failed to delete model' 
    }, 500)
  }
})

// Get categories list
app.get('/api/categories', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT DISTINCT category, COUNT(*) as count 
      FROM models 
      GROUP BY category 
      ORDER BY category
    `).all()
    
    return c.json({ 
      success: true,
      categories: results 
    })
  } catch (error) {
    console.error('Database error:', error)
    return c.json({ 
      success: false,
      error: 'Failed to fetch categories' 
    }, 500)
  }
})

// Get statistics
app.get('/api/stats', async (c) => {
  try {
    const { results: totalModels } = await c.env.DB.prepare(`
      SELECT COUNT(*) as total FROM models
    `).all()
    
    const { results: freeModels } = await c.env.DB.prepare(`
      SELECT COUNT(*) as free FROM models WHERE price = 0
    `).all()
    
    const { results: categories } = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT category) as categories FROM models
    `).all()
    
    const { results: totalSize } = await c.env.DB.prepare(`
      SELECT SUM(file_size) as size FROM models
    `).all()
    
    const total = (totalModels[0] as any)?.total || 0
    const free = (freeModels[0] as any)?.free || 0
    
    return c.json({ 
      success: true,
      stats: {
        total_models: total,
        free_models: free,
        paid_models: total - free,
        categories: (categories[0] as any)?.categories || 0,
        total_size_bytes: (totalSize[0] as any)?.size || 0
      }
    })
  } catch (error) {
    console.error('Database error:', error)
    return c.json({ 
      success: false,
      error: 'Failed to fetch statistics' 
    }, 500)
  }
})

export default app
