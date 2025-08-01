import { User } from '../types/env';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
}

/**
 * Extract user information from Cloudflare Access headers
 * This function reads the headers set by Cloudflare Access when a user is authenticated
 */
export function getUserFromHeaders(request: Request): AuthenticatedUser | null {
  // Cloudflare Access headers
  const cfAccessJwtAssertion = request.headers.get('cf-access-jwt-assertion');
  const cfAccessAuthenticatedUserEmail = request.headers.get('cf-access-authenticated-user-email');
  
  // For development/testing, allow simple auth via custom header
  const devUserEmail = request.headers.get('x-user-email');
  const devUserName = request.headers.get('x-user-name');
  
  if (cfAccessAuthenticatedUserEmail) {
    // Production: Use Cloudflare Access
    return {
      id: generateUserIdFromEmail(cfAccessAuthenticatedUserEmail),
      email: cfAccessAuthenticatedUserEmail,
      name: extractNameFromJWT(cfAccessJwtAssertion) || undefined
    };
  } else if (devUserEmail) {
    // Development: Use custom headers for testing
    return {
      id: generateUserIdFromEmail(devUserEmail),
      email: devUserEmail,
      name: devUserName || undefined
    };
  }
  
  return null;
}

/**
 * Generate a consistent user ID from email
 */
function generateUserIdFromEmail(email: string): string {
  // Simple hash function to generate consistent ID from email
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    const char = email.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `user_${Math.abs(hash).toString(36)}`;
}

/**
 * Extract name from Cloudflare Access JWT (simplified)
 * In production, you'd properly decode and verify the JWT
 */
function extractNameFromJWT(jwt: string | null): string | null {
  if (!jwt) return null;
  
  try {
    // This is a simplified version - in production you should properly verify the JWT
    const payload = JSON.parse(atob(jwt.split('.')[1]));
    return payload.name || payload.given_name || null;
  } catch {
    return null;
  }
}

/**
 * Ensure user exists in database, create if not
 */
export async function ensureUser(db: D1Database, authUser: AuthenticatedUser): Promise<User> {
  // Try to get existing user
  const existingUser = await db.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(authUser.id).first<User>();
  
  if (existingUser) {
    // Update name if provided and different
    if (authUser.name && authUser.name !== existingUser.name) {
      await db.prepare(
        'UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(authUser.name, authUser.id).run();
      
      return { ...existingUser, name: authUser.name, updated_at: new Date().toISOString() };
    }
    return existingUser;
  }
  
  // Create new user
  const newUser: User = {
    id: authUser.id,
    email: authUser.email,
    name: authUser.name || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  await db.prepare(
    'INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(newUser.id, newUser.email, newUser.name, newUser.created_at, newUser.updated_at).run();
  
  return newUser;
}