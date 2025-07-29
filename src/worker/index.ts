import { Hono } from "hono";
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = new Hono<{ Bindings: Env }>();

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

app.post("/api/chat", async (c) => {
  console.log('API Route: Received chat request with history');

  try {
    const { messages } = await c.req.json();
    console.log('API Route: Processing conversation', { messageCount: messages.length });

    // Get the Gemini API key from environment variables
    const apiKey = c.env?.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('API Route: Missing GEMINI_API_KEY');
      return c.json({ error: 'API key not configured' }, 500);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Convert chat messages to Gemini format with full conversation history
    const contents = messages.map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    console.log('API Route: Starting streaming with conversation history');

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const result = await model.generateContentStream({
            contents,
          });

          console.log('API Route: Stream initiated with history');

          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
              console.log('API Route: Streaming chunk', { length: chunkText.length });

              // Send smaller character chunks for smoother typing
              for (let i = 0; i < chunkText.length; i += 3) { // Send 1-3 chars at a time
                const miniChunk = chunkText.slice(i, i + 3);
                const data = JSON.stringify({ content: miniChunk });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));

                // Small delay for typing effect
                await new Promise(resolve => setTimeout(resolve, 20));
              }
            }
          }

          controller.enqueue(encoder.encode(`data: {"done": true}\n\n`));
          console.log('API Route: Stream completed');
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

export default app;
