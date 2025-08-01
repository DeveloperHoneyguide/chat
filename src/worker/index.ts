import { Hono } from "hono";
import { GoogleGenerativeAI } from '@google/generative-ai';
import { cors } from 'hono/cors';
import { Env } from '../types/env';
import { getUserFromHeaders, ensureUser } from '../lib/auth';
import { 
  getUserChats, 
  getChat, 
  createChat, 
  getChatMessages, 
  addMessage, 
  updateChatTitle,
  deleteChat,
  generateChatTitle 
} from '../lib/database';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes
app.use('/*', cors());

// Authentication endpoints (no auth required)
app.get('/api/auth/me', async (c) => {
  const user = getUserFromHeaders(c.req.raw);
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  
  // If no database available, return user directly
  if (!c.env.DB) {
    return c.json({ id: user.email, email: user.email, name: user.name });
  }
  
  const dbUser = await ensureUser(c.env.DB, user);
  return c.json(dbUser);
});

app.post('/api/auth/dev-login', async (c) => {
  if (c.env.NODE_ENV !== 'development') {
    return c.json({ error: 'Development login only available in dev mode' }, 403);
  }
  
  const { email, name } = await c.req.json();
  if (!email) {
    return c.json({ error: 'Email required' }, 400);
  }
  
  const user = { email, name };
  
  // If no database available, return user directly
  if (!c.env.DB) {
    return c.json({ id: user.email, email: user.email, name: user.name });
  }
  
  const dbUser = await ensureUser(c.env.DB, user);
  
  // In a real app, you'd set a session cookie here
  return c.json(dbUser);
});

app.post('/api/auth/logout', async (c) => {
  // In a real app, you'd clear the session cookie here
  return c.json({ success: true });
});

// Authentication middleware for protected routes
app.use('/api/chats/*', async (c, next) => {
  const user = getUserFromHeaders(c.req.raw);
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  
  // If no database available, return error for now
  if (!c.env.DB) {
    return c.json({ error: 'Database not configured. Please set up D1 database for chat persistence.' }, 503);
  }
  
  // Ensure user exists in database
  const dbUser = await ensureUser(c.env.DB, user);
  c.set('user', dbUser);
  
  await next();
});

app.get("/api/", (c) => c.json({ name: "Cloudflare Chat API" }));

// Get all chats for the authenticated user
app.get('/api/chats', async (c) => {
  const user = c.get('user');
  const chats = await getUserChats(c.env.DB, user.id);
  return c.json({ chats });
});

// Get a specific chat with its messages
app.get('/api/chats/:chatId', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('chatId');
  
  const chat = await getChat(c.env.DB, chatId, user.id);
  if (!chat) {
    return c.json({ error: 'Chat not found' }, 404);
  }
  
  const messages = await getChatMessages(c.env.DB, chatId, user.id);
  return c.json({ chat, messages });
});

// Create a new chat
app.post('/api/chats', async (c) => {
  const user = c.get('user');
  const { title } = await c.req.json();
  
  const chat = await createChat(c.env.DB, user.id, title || 'New Chat');
  return c.json({ chat });
});

// Update chat title
app.patch('/api/chats/:chatId', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('chatId');
  const { title } = await c.req.json();
  
  const chat = await getChat(c.env.DB, chatId, user.id);
  if (!chat) {
    return c.json({ error: 'Chat not found' }, 404);
  }
  
  await updateChatTitle(c.env.DB, chatId, user.id, title);
  return c.json({ success: true });
});

// Delete a chat
app.delete('/api/chats/:chatId', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('chatId');
  
  const chat = await getChat(c.env.DB, chatId, user.id);
  if (!chat) {
    return c.json({ error: 'Chat not found' }, 404);
  }
  
  await deleteChat(c.env.DB, chatId, user.id);
  return c.json({ success: true });
});

// Send a message and get AI response (with persistence)
app.post("/api/chats/:chatId/messages", async (c) => {
  console.log('API Route: Received chat message with persistence');

  try {
    const user = c.get('user');
    const chatId = c.req.param('chatId');
    const { message, autoTitle } = await c.req.json();

    // Verify chat exists and user owns it
    const chat = await getChat(c.env.DB, chatId, user.id);
    if (!chat) {
      return c.json({ error: 'Chat not found' }, 404);
    }

    // Save user message to database
    await addMessage(c.env.DB, chatId, 'user', message);

    // Auto-generate chat title if requested and this is the first message
    if (autoTitle && chat.title === 'New Chat') {
      const newTitle = generateChatTitle(message);
      await updateChatTitle(c.env.DB, chatId, user.id, newTitle);
    }

    // Get all messages for context
    const allMessages = await getChatMessages(c.env.DB, chatId, user.id);

    // Get the Gemini API key from environment variables
    const apiKey = c.env?.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('API Route: Missing GEMINI_API_KEY');
      return c.json({ error: 'API key not configured' }, 500);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Convert chat messages to Gemini format
    const contents = allMessages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    console.log('API Route: Starting streaming with persistence', { messageCount: contents.length });

    const encoder = new TextEncoder();
    let assistantResponse = '';

    const readable = new ReadableStream({
      async start(controller) {
        try {
          const result = await model.generateContentStream({
            contents,
          });

          console.log('API Route: Stream initiated with persistence');

          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
              assistantResponse += chunkText;
              console.log('API Route: Streaming chunk', { length: chunkText.length });

              // Send smaller character chunks for smoother typing
              for (let i = 0; i < chunkText.length; i += 3) {
                const miniChunk = chunkText.slice(i, i + 3);
                const data = JSON.stringify({ content: miniChunk });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));

                // Small delay for typing effect
                await new Promise(resolve => setTimeout(resolve, 20));
              }
            }
          }

          // Save assistant response to database
          if (assistantResponse) {
            await addMessage(c.env.DB, chatId, 'assistant', assistantResponse);
          }

          controller.enqueue(encoder.encode(`data: {"done": true}\n\n`));
          console.log('API Route: Stream completed and saved to database');
          controller.close();

        } catch (error) {
          console.error('API Route: Streaming error:', error);
          const errorData = JSON.stringify({
            error: 'Streaming failed',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('API Route: Setup error:', error);
    return c.json(
      { error: 'Failed to setup streaming', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// Legacy endpoint for backward compatibility (without persistence)
app.post("/api/chat", async (c) => {
  console.log('API Route: Legacy chat endpoint - consider migrating to /api/chats/:id/messages');
  
  try {
    const body = await c.req.json();
    
    if (!body.messages || !Array.isArray(body.messages)) {
      return c.json({ error: 'Invalid request: messages array is required' }, 400);
    }
    
    const { messages } = body;
    console.log('API Route: Processing conversation', { messageCount: messages.length });

    const apiKey = c.env?.GEMINI_API_KEY;
    console.log('API Route: API Key check', { 
      hasApiKey: !!apiKey, 
      keyLength: apiKey?.length,
      keyPrefix: apiKey?.substring(0, 10)
    });
    
    if (!apiKey) {
      console.error('API Route: Missing GEMINI_API_KEY');
      return c.json({ error: 'API key not configured. Please contact support.' }, 500);
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Validate and convert messages
      const contents = messages.map((msg: any, index: number) => {
        if (!msg.role || !msg.content) {
          throw new Error(`Invalid message at index ${index}: role and content are required`);
        }
        
        return {
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(msg.content) }],
        };
      });

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            const result = await model.generateContentStream({ contents });

            for await (const chunk of result.stream) {
              const chunkText = chunk.text();
              if (chunkText) {
                for (let i = 0; i < chunkText.length; i += 3) {
                  const miniChunk = chunkText.slice(i, i + 3);
                  const data = JSON.stringify({ content: miniChunk });
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                  await new Promise(resolve => setTimeout(resolve, 20));
                }
              }
            }

            controller.enqueue(encoder.encode(`data: {"done": true}\n\n`));
            controller.close();
          } catch (error) {
            console.error('API Route: Streaming error:', error);
            
            let errorMessage = 'AI service temporarily unavailable';
            if (error instanceof Error) {
              console.error('API Route: Detailed streaming error:', {
                message: error.message,
                stack: error.stack,
                name: error.name
              });
              
              if (error.message.includes('API_KEY') || error.message.includes('API key') || error.message.includes('401')) {
                errorMessage = 'Invalid API key configuration';
              } else if (error.message.includes('QUOTA') || error.message.includes('quota')) {
                errorMessage = 'API quota exceeded. Please try again later';
              } else if (error.message.includes('SAFETY')) {
                errorMessage = 'Content policy violation. Please rephrase your message';
              } else if (error.message.includes('BLOCKED')) {
                errorMessage = 'Content blocked by safety filters';
              } else if (error.message.includes('fetch') || error.message.includes('network')) {
                errorMessage = 'Network error connecting to AI service';
              } else {
                errorMessage = error.message;
              }
            }
            
            const errorData = JSON.stringify({
              error: errorMessage
            });
            controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } catch (modelError) {
      console.error('API Route: Model initialization error:', modelError);
      
      let errorMessage = 'Failed to initialize AI service';
      if (modelError instanceof Error) {
        if (modelError.message.includes('API_KEY')) {
          errorMessage = 'Failed to authenticate with AI service';
        } else if (modelError.message.includes('network') || modelError.message.includes('fetch')) {
          errorMessage = 'Network error connecting to AI service';
        } else {
          errorMessage = modelError.message;
        }
      }
      
      return c.json({ error: errorMessage }, 500);
    }

  } catch (error) {
    console.error('API Route: Request parsing error:', error);
    
    let errorMessage = 'Invalid request format';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return c.json({ error: errorMessage }, 400);
  }
});

export default app;
