import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: env.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'SYS:HH:MM:ss.l',
        },
      },
});
