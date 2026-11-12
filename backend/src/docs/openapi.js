'use strict';

/** OpenAPI 3 document served at /api/docs. Paths are added per module. */
module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'ESG Management System API',
    version: '1.0.0',
    description: 'Collect → Verify → Approve → Measure → Report. See backend.md.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string' },
              request_id: { type: 'string' },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { field: { type: 'string' }, message: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        security: [],
        responses: {
          200: {
            description: 'API and database are up',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    db: { type: 'string', example: 'up' },
                  },
                },
              },
            },
          },
          503: { description: 'Database unavailable' },
        },
      },
    },
  },
};

