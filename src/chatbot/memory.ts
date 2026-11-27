import { runtime } from '../config/runtime';

// Keep prompt context and persisted session history as separate limits.
export function contextHistory<T>(history: T[]): T[] {
  return history.slice(-runtime.chatbot.maxContextMessages);
}

export function trimSessionHistory<T>(history: T[]): T[] {
  return history.length > runtime.chatbot.maxSessionHistory
    ? history.slice(-runtime.chatbot.maxSessionHistory)
    : history;
}
