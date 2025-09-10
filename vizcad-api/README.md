# VizCad API

A Cloudflare Workers API for VizCad 3D model management using D1 database.

## Database Setup

### Prerequisites
1. Cloudflare account
2. Wrangler CLI installed
3. Node.js and pnpm

### Quick Setup
Run the automated setup script:
```bash
pnpm db:setup
```

This will show you the manual steps to follow.

### Manual Setup Steps

1. **Login to Cloudflare:**
   ```bash
   pnpm wrangler login
   ```

2. **Create D1 Database:**
   ```bash
   pnpm db:create
   ```
   Copy the `database_id` from the output.

3. **Update Configuration:**
   Edit `wrangler.jsonc` and replace the empty `database_id` with the one from step 2.

4. **Run Migrations:**
   ```bash
   pnpm db:migrate-only
   ```

5. **Generate Types:**
   ```bash
   pnpm cf-typegen
   ```

### Alternative: Use Migration Script
After creating the database manually, you can run:
```bash
pnpm db:migrate-only
```
This will run migrations and generate types automatically.

## Development

Start the development server:
```bash
pnpm dev
```

## Database Management

- **Open D1 Studio:** `pnpm db:studio`
- **Run migrations:** `pnpm db:migrate`
- **Create new migration:** Add SQL files to `migrations/` directory

## API Endpoints

- `GET /` - Health check
- `GET /models` - Get all models
- `GET /models/:id` - Get model by ID
- `POST /models` - Create new model
- `PUT /models/:id` - Update model
- `DELETE /models/:id` - Delete model
- `GET /stats` - Get statistics

## Deployment

Deploy to Cloudflare:
```bash
pnpm deploy
```

## Available Scripts

```bash
# Development
pnpm dev              # Start development server
pnpm deploy           # Deploy to Cloudflare

# Database
pnpm db:setup         # Show setup instructions
pnpm db:create        # Create D1 database
pnpm db:migrate       # Run migrations manually
pnpm db:migrate-only  # Run migrations + generate types (after db creation)
pnpm db:studio        # Open D1 Studio

# Types
pnpm cf-typegen       # Generate TypeScript types
```
