import pino from 'pino'

// Configure Pino with conditional transport based on environment
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Disable pino-pretty transport completely to avoid thread-stream worker issues in Next.js
  // Use basic JSON logging for now to prevent module resolution errors
})

// Create a child logger for the application
export const appLogger = logger.child({ component: 'corelive' })

// Export individual log levels for convenience
export const log = {
  error: (message: string, ...args: any[]) => appLogger.error(message, ...args),
  warn: (message: string, ...args: any[]) => appLogger.warn(message, ...args),
  info: (message: string, ...args: any[]) => appLogger.info(message, ...args),
  debug: (message: string, ...args: any[]) => appLogger.debug(message, ...args),
  trace: (message: string, ...args: any[]) => appLogger.trace(message, ...args),
}

export default logger
