# 🔧 API Key Troubleshooting Guide

## Current Error
```
Failed to parse SSE data: data: {"error":"Invalid API key configuration"}
```

## Troubleshooting Steps

### 1. **Verify API Key Setup**
The API key is configured in multiple places:
- `wrangler.json` (for production)
- `.dev.vars` (for local development)
- `.env` (for client-side development)

### 2. **Test the API Key Directly**
You can test the API key using curl:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{"text": "Hello"}]
    }]
  }' \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=AIzaSyBrl8vUy0miKjLZ9jwcqoneCFiiHFawLno"
```

### 3. **Check Wrangler Development**
For local development, use:

```bash
# Start the development server
npm run dev
# or
wrangler dev
```

Make sure `.dev.vars` file exists and contains:
```
GEMINI_API_KEY=AIzaSyBrl8vUy0miKjLZ9jwcqoneCFiiHFawLno
```

### 4. **Verify API Key Permissions**
The API key needs these permissions enabled in Google Cloud Console:
- Generative Language API
- AI Platform API (if using Vertex AI)

### 5. **Check for Rate Limits**
- New API keys may have lower quotas
- Check the Google Cloud Console for quota usage

### 6. **Development vs Production**
- **Development**: Uses `.dev.vars` file
- **Production**: Uses `wrangler.json` vars or secrets

## Quick Fix Commands

```bash
# If using Wrangler secrets instead
wrangler secret put GEMINI_API_KEY
# Then enter: AIzaSyBrl8vUy0miKjLZ9jwcqoneCFiiHFawLno

# Check current configuration
wrangler dev --show-interactive-dev-session

# Test the worker locally
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}'
```

## Expected Behavior
✅ **Working**: Should stream AI responses character by character
❌ **Broken**: Returns "Invalid API key configuration" error

## Debug Information Added
The worker now logs:
- API key presence and length
- Detailed error messages
- Request validation info

Check the console logs when making requests to see what's happening.