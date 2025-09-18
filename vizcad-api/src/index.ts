import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handleSSR } from './ssr-middleware'

interface Env {
  DB: D1Database
  R2_BUCKET: R2Bucket
}

const app = new Hono<{ Bindings: Env }>()

// CORS middleware
app.use('*', cors())

// Health check
app.get('/', (c) => {
  return c.json({ 
    message: 'VizCad API v2.0 - Clean D1 + R2 Architecture',
    version: '2.0.0',
    storage: 'Cloudflare R2',
    database: 'Cloudflare D1',
    status: 'operational'
  })
})

// Get all models
app.get('/api/models', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, name, description, file_url, file_size, file_type, 
             price, category, tags, created_by, thumbnail_url, 
             created_at, updated_at, download_count, is_featured
      FROM models 
      WHERE status = 'active'
      ORDER BY is_featured DESC, created_at DESC
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
      SELECT * FROM models WHERE id = ? AND status = 'active'
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

// Upload new model - Professional R2 Integration
app.post('/api/models', async (c) => {
  try {
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
    
    // Validate file size (max 100MB for R2)
    if (file_size > 100 * 1024 * 1024) {
      return c.json({ 
        success: false,
        error: 'File size too large. Maximum 100MB allowed.' 
      }, 400)
    }
    
    // Generate unique file key for R2
    const timestamp = Date.now()
    const uuid = crypto.randomUUID()
    const file_key = `models/${timestamp}-${uuid}.${file_type}`
    
    // Upload file to R2 with error handling
    let r2_upload_success = false
    let file_url = `https://files.vizcad.com/${file_key}` // Default URL
    
    try {
      const fileBuffer = await file.arrayBuffer()
      await c.env.R2_BUCKET.put(file_key, fileBuffer, {
        httpMetadata: {
          contentType: file_type === 'stl' ? 'application/vnd.ms-pki.stl' : 'application/octet-stream',
          contentDisposition: `attachment; filename="${name.replace(/[^a-zA-Z0-9]/g, '_')}.${file_type}"`
        },
        customMetadata: {
          originalName: file.name,
          uploadedBy: created_by,
          uploadedAt: new Date().toISOString(),
          modelName: name
        }
      })
      
      r2_upload_success = true
      console.log(`✅ File uploaded to R2: ${file_key}`)
    } catch (r2Error) {
      console.error('R2 upload failed, continuing with metadata-only upload:', r2Error)
      // In development mode, create a placeholder URL
      file_url = `http://127.0.0.1:8787/api/models/placeholder/${file_key}`
      r2_upload_success = false
    }
    
    // Handle thumbnail upload to R2 (optional)
    let thumbnail_url = null
    if (thumbnail && thumbnail.startsWith('data:image/')) {
      try {
        if (r2_upload_success) {
          // Convert base64 to binary
          const base64Data = thumbnail.split(',')[1]
          const thumbnailBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
          
          const thumbnail_key = `thumbnails/${timestamp}-${uuid}.png`
          await c.env.R2_BUCKET.put(thumbnail_key, thumbnailBuffer, {
            httpMetadata: {
              contentType: 'image/png',
              cacheControl: 'public, max-age=31536000'
            }
          })
          
          thumbnail_url = `https://files.vizcad.com/${thumbnail_key}`
          console.log(`✅ Thumbnail uploaded to R2: ${thumbnail_key}`)
        } else {
          // R2 not available, use base64 thumbnail
          thumbnail_url = thumbnail
          console.log(`⚠️ R2 not available, using base64 thumbnail`)
        }
      } catch (thumbError) {
        console.error('Thumbnail upload failed:', thumbError)
        // Always fallback to base64 thumbnail
        thumbnail_url = thumbnail
      }
    }
    
    // Store metadata in D1
    const { results } = await c.env.DB.prepare(`
      INSERT INTO models (name, description, file_url, file_size, file_type, file_key, price, category, tags, created_by, thumbnail_url, created_at, updated_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'active')
      RETURNING *
    `).bind(
      name, 
      description, 
      file_url, 
      file_size, 
      file_type, 
      file_key,
      price, 
      category.toLowerCase(), 
      tags, 
      created_by,
      thumbnail_url
    ).all()
    
    console.log(`✅ Model metadata saved to D1: ${name}`)
    
    return c.json({ 
      success: true,
      message: 'Model uploaded successfully to R2 storage',
      model: results[0]
    }, 201)
    
  } catch (error) {
    console.error('Upload error:', error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    return c.json({ 
      success: false,
      error: 'Failed to upload model',
      details: errorMsg
    }, 500)
  }
})

// Download model file from R2
app.get('/api/models/:id/download', async (c) => {
  try {
    const id = c.req.param('id')
    
    // Get model metadata from D1
    const { results } = await c.env.DB.prepare(`
      SELECT id, name, file_key, file_type, file_size, download_count 
      FROM models 
      WHERE id = ? AND status = 'active'
    `).bind(id).all()
    
    if (results.length === 0) {
      return c.json({ 
        success: false,
        error: 'Model not found' 
      }, 404)
    }
    
    const model = results[0] as any
    
    // Get file from R2
    const r2Object = await c.env.R2_BUCKET.get(model.file_key)
    
    if (!r2Object) {
      return c.json({ 
        success: false,
        error: 'File not found in storage' 
      }, 404)
    }
    
    // Update download count asynchronously
    c.executionCtx.waitUntil(
      c.env.DB.prepare(`
        UPDATE models 
        SET download_count = download_count + 1,
            updated_at = datetime('now')
        WHERE id = ?
      `).bind(id).run()
    )
    
    console.log(`📥 Model downloaded: ${model.name}`)
    
    // Return file as download
    const filename = `${model.name.replace(/[^a-zA-Z0-9]/g, '_')}.${model.file_type}`
    
    return new Response(r2Object.body, {
      headers: {
        'Content-Type': model.file_type === 'stl' ? 'application/vnd.ms-pki.stl' : 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': model.file_size?.toString() || r2Object.size.toString(),
        'Access-Control-Expose-Headers': 'Content-Disposition',
        'Cache-Control': 'private, no-cache'
      }
    })
    
  } catch (error) {
    console.error('Download error:', error)
    return c.json({ 
      success: false,
      error: 'Failed to process download request' 
    }, 500)
  }
})

// Serve model file from R2 (for preview/viewing)
app.get('/api/models/:id/file', async (c) => {
  try {
    const id = c.req.param('id')
    
    const { results } = await c.env.DB.prepare(`
      SELECT file_key, file_type, name FROM models WHERE id = ? AND status = 'active'
    `).bind(id).all()
    
    if (results.length === 0) {
      return c.json({ 
        success: false,
        error: 'Model not found' 
      }, 404)
    }
    
    const model = results[0] as any
    
    // Get file from R2
    const r2Object = await c.env.R2_BUCKET.get(model.file_key)
    
    if (!r2Object) {
      return c.json({ 
        success: false,
        error: 'File not found in storage' 
      }, 404)
    }
    
    // Return file for viewing/preview
    return new Response(r2Object.body, {
      headers: {
        'Content-Type': model.file_type === 'stl' ? 'application/vnd.ms-pki.stl' : 'application/octet-stream',
        'Content-Disposition': `inline; filename="${model.name}.${model.file_type}"`,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*'
      }
    })
    
  } catch (error) {
    console.error('File serve error:', error)
    return c.json({ 
      success: false,
      error: 'Failed to serve file' 
    }, 500)
  }
})

// Serve thumbnail from R2
app.get('/api/models/:id/thumbnail', async (c) => {
  try {
    const id = c.req.param('id')
    
    // Get thumbnail path from database
    const { results } = await c.env.DB.prepare(`
      SELECT thumbnail_url, name FROM models WHERE id = ? AND status = 'active'
    `).bind(id).all()
    
    if (results.length === 0) {
      return c.json({ 
        success: false,
        error: 'Model not found' 
      }, 404)
    }
    
    const model = results[0] as any
    
    // If no thumbnail_url, return placeholder
    if (!model.thumbnail_url) {
      return c.json({ 
        success: false,
        error: 'No thumbnail available' 
      }, 404)
    }
    
    // If thumbnail_url is base64, return it directly
    if (model.thumbnail_url.startsWith('data:image/')) {
      const base64Data = model.thumbnail_url.split(',')[1]
      const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
      
      return new Response(imageBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400', // 24 hours
          'Access-Control-Allow-Origin': '*'
        }
      })
    }
    
    // If thumbnail_url is R2 URL, extract key and serve from R2
    if (model.thumbnail_url.includes('files.vizcad.com/')) {
      const thumbnailKey = model.thumbnail_url.split('files.vizcad.com/')[1]
      
      const r2Object = await c.env.R2_BUCKET.get(thumbnailKey)
      
      if (!r2Object) {
        return c.json({ 
          success: false,
          error: 'Thumbnail not found in storage' 
        }, 404)
      }
      
      return new Response(r2Object.body, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400', // 24 hours
          'Access-Control-Allow-Origin': '*'
        }
      })
    }
    
    // Unknown thumbnail format
    return c.json({ 
      success: false,
      error: 'Invalid thumbnail format' 
    }, 400)
    
  } catch (error) {
    console.error('Thumbnail serve error:', error)
    return c.json({ 
      success: false,
      error: 'Failed to serve thumbnail' 
    }, 500)
  }
})

// Get categories
app.get('/api/categories', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT DISTINCT category, COUNT(*) as count 
      FROM models 
      WHERE status = 'active'
      GROUP BY category 
      ORDER BY count DESC, category ASC
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
      SELECT COUNT(*) as total FROM models WHERE status = 'active'
    `).all()
    
    const { results: freeModels } = await c.env.DB.prepare(`
      SELECT COUNT(*) as free FROM models WHERE price = 0 AND status = 'active'
    `).all()
    
    const { results: categories } = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT category) as categories FROM models WHERE status = 'active'
    `).all()
    
    const { results: totalDownloads } = await c.env.DB.prepare(`
      SELECT SUM(download_count) as downloads FROM models WHERE status = 'active'
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
        total_downloads: (totalDownloads[0] as any)?.downloads || 0
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

// Development placeholder endpoint for when R2 is not available
app.get('/api/models/placeholder/*', async (c) => {
  return c.json({ 
    success: false,
    error: 'R2 storage not enabled',
    message: 'Please enable R2 in Cloudflare Dashboard to download files',
    setup_url: 'https://dash.cloudflare.com/'
  }, 503)
})

// SSR Routes - these should be handled by the SSR middleware
app.get('/', handleSSR)
app.get('/contact', handleSSR)
app.get('/faq', handleSSR)
app.get('/store', handleSSR)

// SPA Routes - serve the basic shell and let client handle routing  
app.get('/app/*', async (c) => {
  // These routes are handled client-side, just serve the shell
  return handleSSR(c) // The middleware will detect it's a SPA route
})

app.get('/ModelSnap/*', async (c) => {
  return handleSSR(c)
})

app.get('/viewEmbed/*', async (c) => {
  return handleSSR(c)
})

// Catch all other routes and serve SPA shell
app.get('*', async (c) => {
  return handleSSR(c)
})

export default app
