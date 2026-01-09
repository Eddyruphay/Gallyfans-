import pino from 'pino';

// Define a base logger configuration
const baseConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
};

// Use pino-pretty for development, but structured JSON for production
const transport = process.env.NODE_ENV !== 'production'
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

const pinoLogger = pino({ ...baseConfig, transport });

// Create a wrapper to add a custom fatal method that exits the process
const logger = {
  info: pinoLogger.info.bind(pinoLogger),
  warn: pinoLogger.warn.bind(pinoLogger),
  error: pinoLogger.error.bind(pinoLogger),
  debug: pinoLogger.debug.bind(pinoLogger),
  fatal: (...args: Parameters<pino.LogFn>) => {
    pinoLogger.fatal(...args);
    process.exit(1);
  },
};

export default logger;