import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import authRoutes from './auth/auth.routes';
import loanRoutes from './loans/loan.routes';
import { errorHandler } from './middleware/errorHandler';
import { openapi } from './docs/openapi';
import { config } from './config';

const app = express();

// API docs — always available so you can test from any environment
app.get('/docs.json', (_req, res) => res.json(openapi));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { swaggerOptions: { persistAuthorization: true } }));

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Serve uploaded avatars as public static files
// e.g. http://localhost:3000/uploads/avatars/<filename>
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/v1', authRoutes);
app.use('/v1', loanRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found', details: {} } });
});

app.use(errorHandler);

export default app;
