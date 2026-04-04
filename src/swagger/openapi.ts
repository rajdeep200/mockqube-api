import swaggerJSDoc from 'swagger-jsdoc';
import { env } from '../config/env.js';

export const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MockQube API',
      version: '1.0.0',
      description: 'AI-driven mock DSA interview backend.'
    },
    servers: [{ url: env.API_BASE_URL }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./src/modules/**/*.ts', './src/app.ts']
});
