import {
    Router
} from 'express';

import authRoutes
    from './auth.routes.js';

import solicitudesRoutes
    from './solicitudes.routes.js';

const router =
    Router();

router.use(
    '/auth',
    authRoutes
);

router.use(
    '/solicitudes',
    solicitudesRoutes
);

export default router;