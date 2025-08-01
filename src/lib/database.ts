import { Chat, Message } from '../types/env';

/**
 * Generate a unique ID for chats and messages
 */
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all chats for a user, ordered by most recent first
 */
export async function getUserChats(db: D1Database, userId: string): Promise<Chat[]> {
  const result = await db.prepare(
    'SELECT * FROM chats WHERE user_id = ? ORDER BY updated_at DESC'
  ).bind(userId).all<Chat>();
  
  return result.results || [];
}

/**
 * Get a specific chat by ID (with user ownership check)
 */
export async function getChat(db: D1Database, chatId: string, userId: string): Promise<Chat | null> {
  const result = await db.prepare(
    'SELECT * FROM chats WHERE id = ? AND user_id = ?'
  ).bind(chatId, userId).first<Chat>();
  
  return result || null;
}

/**
 * Create a new chat
 */
export async function createChat(db: D1Database, userId: string, title: string): Promise<Chat> {
  const chatId = generateId('chat');
  const now = new Date().toISOString();
  
  const newChat: Chat = {
    id: chatId,
    user_id: userId,
    title: title || 'New Chat',
    created_at: now,
    updated_at: now
  };
  
  await db.prepare(
    'INSERT INTO chats (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(newChat.id, newChat.user_id, newChat.title, newChat.created_at, newChat.updated_at).run();
  
  return newChat;
}

/**
 * Update chat title and updated_at timestamp
 */
export async function updateChatTitle(db: D1Database, chatId: string, userId: string, title: string): Promise<void> {
  await db.prepare(
    'UPDATE chats SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
  ).bind(title, chatId, userId).run();
}

/**
 * Update chat's updated_at timestamp (called when new messages are added)
 */
export async function touchChat(db: D1Database, chatId: string): Promise<void> {
  await db.prepare(
    'UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(chatId).run();
}

/**
 * Delete a chat and all its messages
 */
export async function deleteChat(db: D1Database, chatId: string, userId: string): Promise<void> {
  // Delete messages first (foreign key constraint)
  await db.prepare(
    'DELETE FROM messages WHERE chat_id = ?'
  ).bind(chatId).run();
  
  // Delete chat
  await db.prepare(
    'DELETE FROM chats WHERE id = ? AND user_id = ?'
  ).bind(chatId, userId).run();
}

/**
 * Get all messages for a chat, ordered by creation time
 */
export async function getChatMessages(db: D1Database, chatId: string, userId: string): Promise<Message[]> {
  // First verify user owns the chat
  const chat = await getChat(db, chatId, userId);
  if (!chat) {
    return [];
  }
  
  const result = await db.prepare(
    'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC'
  ).bind(chatId).all<Message>();
  
  return result.results || [];
}

/**
 * Add a message to a chat
 */
export async function addMessage(
  db: D1Database, 
  chatId: string, 
  role: 'user' | 'assistant', 
  content: string
): Promise<Message> {
  const messageId = generateId('msg');
  const now = new Date().toISOString();
  
  const newMessage: Message = {
    id: messageId,
    chat_id: chatId,
    role,
    content,
    created_at: now
  };
  
  await db.prepare(
    'INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(newMessage.id, newMessage.chat_id, newMessage.role, newMessage.content, newMessage.created_at).run();
  
  // Update chat's updated_at timestamp
  await touchChat(db, chatId);
  
  return newMessage;
}

/**
 * Generate a chat title from the first user message (smart title generation)
 */
export function generateChatTitle(firstMessage: string): string {
  // Clean and truncate the message to create a title
  const cleaned = firstMessage.trim().replace(/\n/g, ' ').substring(0, 60);
  
  // If it's too short, use a default
  if (cleaned.length < 10) {
    return 'New Chat';
  }
  
  // Add ellipsis if truncated
  return cleaned.length === 60 ? cleaned + '...' : cleaned;
}