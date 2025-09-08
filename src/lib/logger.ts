import pino from 'pino'

// Configure Pino with pino-pretty for development
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname',
      singleLine: false,
    },
  },
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
