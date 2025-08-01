# Database Setup Instructions

This guide explains how to set up the Cloudflare D1 database for chat persistence.

## 1. Create D1 Database

```bash
# Create the database
npx wrangler d1 create chat-db

# This will output something like:
# ✅ Successfully created DB 'chat-db'
# Database ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## 2. Update Wrangler Configuration

Copy the database ID from step 1 and update `wrangler.json`:

```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "chat-db",
      "database_id": "YOUR_ACTUAL_DATABASE_ID_HERE"
    }
  ]
}
```

Replace `placeholder-db-id` with your actual database ID.

## 3. Initialize Database Schema

Run the schema to create tables:

```bash
# For local development
npx wrangler d1 execute chat-db --local --file=./schema.sql

# For production
npx wrangler d1 execute chat-db --file=./schema.sql
```

## 4. Authentication Setup

### Option A: Cloudflare Access (Recommended for Production)

1. Set up Cloudflare Access for your domain
2. Configure authentication policies
3. The app will automatically read user info from `cf-access-authenticated-user-email` header

### Option B: Development Testing

For local testing, you can send custom headers:

```bash
curl -H "x-user-email: test@example.com" \
     -H "x-user-name: Test User" \
     https://your-app.workers.dev/api/chats
```

## 5. API Endpoints

### Authentication Required

All `/api/*` endpoints require authentication via Cloudflare Access or development headers.

### Chat Management

- `GET /api/chats` - List all user chats
- `POST /api/chats` - Create new chat
- `GET /api/chats/:id` - Get chat with messages
- `PATCH /api/chats/:id` - Update chat title
- `DELETE /api/chats/:id` - Delete chat

### Messaging

- `POST /api/chats/:id/messages` - Send message and get AI response (with persistence)

### Legacy

- `POST /api/chat` - Legacy endpoint (no persistence, no auth required)

## 6. Local Development

1. Start local D1 database:
```bash
npx wrangler d1 execute chat-db --local --file=./schema.sql
```

2. Start development server:
```bash
npm run dev
```

3. Test with development headers or set up Cloudflare Access tunnel.

## Database Schema

The app uses three main tables:

- **users**: Store user information from authentication
- **chats**: Individual chat sessions
- **messages**: Messages within chats

See `schema.sql` for the complete schema definition.