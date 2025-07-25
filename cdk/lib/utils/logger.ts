/**
 * Custom logger with extended functionality.
 *
 * @remarks
 * This logger extends the functionality of the Winston logger by providing
 * an additional `logDetailedObject` method for logging complex objects with
 * an unlimited depth.
 *
 * @packageDocumentation
 */

import * as winston from 'winston';

import util from 'util';

const logFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ' ' + util.inspect(metadata, { colors: true, depth: null });
  }
  return msg;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.colorize(),
    logFormat,
  ),
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
});

/**
 * Function to log detailed objects
 */
function detailedObject(message: string, obj: unknown, level: string = 'info') {
  const serializedObj = util.inspect(obj, { depth: null, colors: true, maxArrayLength: null });
  logger.log(level, `${message}: ${serializedObj}`);
}

/**
 * Extended logger interface
 */
interface ExtendedLogger extends winston.Logger {
  detailedObject: typeof detailedObject;
}

/**
 * Extended logger instance
 */
const extendedLogger = logger as ExtendedLogger;
extendedLogger.detailedObject = detailedObject;

/**
 * Export the extended logger instance
 */
export default extendedLogger;
