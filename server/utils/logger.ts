/**
 * Simple logger with debug mode controlled by DEBUG env var
 *
 * Usage:
 *   import { logger } from '../utils/logger';
 *   logger.debug('github-browse', 'Loading manifest for', owner, repo);
 *   logger.info('auth', 'User logged in:', username);
 *   logger.error('api', 'Failed to fetch:', error);
 */

const isDebug = process.env.DEBUG === 'true';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function formatMessage(level: LogLevel, context: string, ...args: unknown[]): string {
  const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${context}]`;
  return `${prefix} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`;
}

export const logger = {
  /** Debug logs - only shown when DEBUG=true */
  debug(context: string, ...args: unknown[]) {
    if (isDebug) {
      console.log(formatMessage('debug', context, ...args));
    }
  },

  /** Info logs - always shown */
  info(context: string, ...args: unknown[]) {
    console.log(formatMessage('info', context, ...args));
  },

  /** Warning logs - always shown */
  warn(context: string, ...args: unknown[]) {
    console.warn(formatMessage('warn', context, ...args));
  },

  /** Error logs - always shown */
  error(context: string, ...args: unknown[]) {
    console.error(formatMessage('error', context, ...args));
  },
};
