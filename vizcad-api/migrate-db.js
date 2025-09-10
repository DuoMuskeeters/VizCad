#!/usr/bin/env node

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

console.log('🔧 VizCad Database Migration Tool')
console.log('=================================\n')

try {
  // Check if database exists
  console.log('🔍 Checking database status...')
  try {
    execSync('pnpm wrangler d1 list', { encoding: 'utf8', stdio: 'pipe' })
  } catch (error) {
    console.log('❌ No database found. Please create one first:')
    console.log('   pnpm wrangler d1 create vizcad-db')
    process.exit(1)
  }

  // Run migrations
  console.log('📋 Running database migrations...')
  execSync('pnpm wrangler d1 execute vizcad-db --file=migrations/001_initial_schema.sql', {
    encoding: 'utf8',
    cwd: process.cwd()
  })
  console.log('✅ Database schema created successfully!')

  // Generate types
  console.log('🔧 Generating TypeScript types...')
  execSync('pnpm cf-typegen', {
    encoding: 'utf8',
    cwd: process.cwd()
  })
  console.log('✅ TypeScript types generated!')

  console.log('\n🎉 Database setup completed!')
  console.log('\nNext steps:')
  console.log('• pnpm dev - Start development server')
  console.log('• pnpm db:studio - Open database management UI')

} catch (error) {
  console.error('❌ Error:', error.message)
  process.exit(1)
}
