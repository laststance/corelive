const pino = require('pino')

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
const appLogger = logger.child({ component: 'corelive' })

// Export individual log levels for convenience
const log = {
  error: (message, ...args) => appLogger.error(message, ...args),
  warn: (message, ...args) => appLogger.warn(message, ...args),
  info: (message, ...args) => appLogger.info(message, ...args),
  debug: (message, ...args) => appLogger.debug(message, ...args),
  trace: (message, ...args) => appLogger.trace(message, ...args),
}

module.exports = {
  logger,
  appLogger,
  log,
  default: logger,
}
