#!/usr/bin/env node

import { execSync } from 'child_process'
import { readFileSync } from 'fs'

console.log('🔥 VizCad Database Reset Tool')
console.log('============================\n')

try {
  // First, let's check what databases exist
  console.log('📋 Checking existing databases...')
  try {
    const listOutput = execSync('pnpm wrangler d1 list', { encoding: 'utf8', stdio: 'pipe' })
    console.log('Existing databases:', listOutput)
  } catch (error) {
    console.log('No databases found or error listing databases')
  }

  // Try to drop existing database
  console.log('🗑️ Attempting to drop existing database...')
  try {
    execSync('pnpm wrangler d1 delete vizcad-db --force', { 
      encoding: 'utf8', 
      stdio: 'inherit',
      timeout: 30000 // 30 second timeout
    })
    console.log('✅ Old database deleted')
    
    // Wait a bit for deletion to complete
    console.log('⏳ Waiting for database deletion to complete...')
    await new Promise(resolve => setTimeout(resolve, 5000))
  } catch (error) {
    console.log('⚠️ Error deleting database (might not exist):', error.message)
  }

  // Try to create new database
  console.log('🆕 Creating new database...')
  try {
    execSync('pnpm wrangler d1 create vizcad-db', {
      encoding: 'utf8',
      stdio: 'inherit',
      timeout: 30000
    })
    console.log('✅ New database created')
  } catch (error) {
    console.log('❌ Failed to create database. Let\'s try to use existing one...')
    console.log('Error:', error.message)
  }

  // Wait a bit for database to be ready
  console.log('⏳ Waiting for database to be ready...')
  await new Promise(resolve => setTimeout(resolve, 3000))

  // Clear existing tables (drop and recreate)
  console.log('🧹 Cleaning existing tables...')
  try {
    execSync('pnpm wrangler d1 execute vizcad-db --command="DROP TABLE IF EXISTS models"', {
      encoding: 'utf8',
      stdio: 'inherit'
    })
    console.log('✅ Existing tables dropped')
  } catch (error) {
    console.log('⚠️ Error dropping tables (might not exist):', error.message)
  }

  // Run initial schema
  console.log('📋 Running initial schema migration...')
  execSync('pnpm wrangler d1 execute vizcad-db --file=migrations/001_initial_schema.sql', {
    encoding: 'utf8',
    stdio: 'inherit'
  })
  console.log('✅ Initial schema created')

  console.log('\n✅ Database reset completed successfully!')
  console.log('� Clean D1 + R2 architecture ready!')
  console.log('� Files will be stored in Cloudflare R2, metadata in D1')

} catch (error) {
  console.error('❌ Database reset failed:', error.message)
  console.log('\n🔧 Manual steps you can try:')
  console.log('1. pnpm wrangler d1 list')
  console.log('2. pnpm wrangler d1 delete vizcad-db --force')  
  console.log('3. pnpm wrangler d1 create vizcad-db')
  console.log('4. pnpm wrangler d1 execute vizcad-db --file=migrations/001_initial_schema.sql')
  process.exit(1)
}