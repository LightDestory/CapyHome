import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { UniqueConstraintError, ValidationError } from 'sequelize';
import { openDatabase } from './db.js';
import { loadConfig } from './config.js';
import { translator } from './i18n/index.js';
import { HttpError } from './utils/http-error.js';
import { createLocaleMiddleware } from './middleware/locale.js';
import { createRequestGuard, createBodyGuard } from './middleware/security.js';
import { createSessionMiddleware } from './middleware/session.js';
import { bootstrapAdmin, createAuthRouter } from './api/auth.js';
import { createSessionRouter } from './api/session.js';
import { createHealthRouter } from './api/health.js';
import { createDashboardRouter } from './api/dashboard.js';
import { createCleaningRouter } from './api/cleaning.js';
import { createWasteRouter } from './api/waste.js';
import { createFundRouter } from './api/fund.js';
import { createAdminRouter } from './api/admin.js';
import { createQueries } from './services/queries.js';
import { createMutate } from './services/mutate.js';

const publicPath = fileURLToPath(new URL('../public/', import.meta.url));

export async function createApp(options = {}) {
  const config = loadConfig(options);
  const db = await openDatabase(config.databasePath);
  const app = express();
  try {
    const defaultLocale = await translator();
    new Intl.DateTimeFormat('en', { timeZone: config.timeZone });
    await bootstrapAdmin(db, config);
    app.disable('x-powered-by');
    if (config.trustProxy) app.set('trust proxy', 1);
    app.use(helmet({
      contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'style-src': ["'self'"], 'img-src': ["'self'", 'data:'], 'upgrade-insecure-requests': config.cookieSecure ? [] : null } },
      strictTransportSecurity: config.cookieSecure ? undefined : false
    }));
    app.use(createLocaleMiddleware(defaultLocale.language));
    app.use(createHealthRouter(db));
    app.use('/api', createRequestGuard());
    app.use(express.json({ limit: '32kb' }));
    app.use('/api', createBodyGuard());
    app.use(await createAuthRouter(db, config));
    app.use('/api', createSessionMiddleware(db));
    app.use(createSessionRouter(db, config));
    const queries = createQueries(db);
    const mutate = createMutate(db);
    app.use(createDashboardRouter(db, queries));
    app.use(createCleaningRouter(db, queries, mutate, config));
    app.use(createWasteRouter(db, queries, mutate, config));
    app.use(createFundRouter(db, queries, mutate, config));
    app.use(createAdminRouter(db, queries, mutate));
    app.use('/api', (req, res) => res.status(404).json({ error: req.t('errors.notFound') }));
    app.use(express.static(publicPath, { index: 'index.html', maxAge: 0 }));
    app.use((req, res) => res.status(404).send(req.t('errors.pageNotFound')));
    app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);
      const t = req.t || defaultLocale.t;
      if (error instanceof HttpError) {
        const params = { ...error.params };
        if (params.field) params.field = t(params.field);
        return res.status(error.status).json({ error: t(error.code, params) });
      }
      if (error.type === 'entity.parse.failed') return res.status(400).json({ error: t('errors.json') });
      if (error.type === 'entity.too.large') return res.status(413).json({ error: t('errors.tooLarge') });
      if (error instanceof UniqueConstraintError) return res.status(409).json({ error: t('errors.duplicate') });
      if (error instanceof ValidationError) return res.status(400).json({ error: t('errors.validation') });
      if (error.original?.code === 'SQLITE_BUSY') return res.status(503).json({ error: t('errors.busy') });
      console.error(error);
      res.status(500).json({ error: t('errors.internal') });
    });
    return { app, db };
  } catch (error) {
    await db.close();
    throw error;
  }
}
