'use strict';

const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const pinoHttp = require('pino-http');
const swaggerUi = require('swagger-ui-express');

const env = require('./config/env');
const logger = require('./utils/logger');
const { globalLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');
const openapi = require('./docs/openapi');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind a TLS reverse proxy in production

  // Request ID + structured request logging
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'] || crypto.randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customProps: (req) => ({ user_id: req.user ? req.user.id : undefined }),
      autoLogging: env.NODE_ENV !== 'test',
    }),
  );

  // Security headers (HSTS, nosniff, …) and strict CORS
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(mongoSanitize()); // strip $ / . operators from client input
  app.use(hpp());

  app.use('/api', globalLimiter);
  app.use('/api/v1', apiRoutes);
  app.use(
    '/api/docs',
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(openapi),
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };

