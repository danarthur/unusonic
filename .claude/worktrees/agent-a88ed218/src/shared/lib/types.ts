/**
 * TypeScript type definitions for the application
 */

/**
 * Chat message role types
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Chat message interface matching Vercel AI SDK format
 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt?: Date;
}

/**
 * Props for message list components
 */
export interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

