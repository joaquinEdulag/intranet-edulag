import {
    Router
} from 'express';

import {
    getAuthConfig,
    getCurrentUser
} from '../controllers/auth.controller.js';

import {
    requireMicrosoftAuth
} from '../middlewares/auth.middleware.js';

import {
    loadPerfilLaboral
} from '../middlewares/perfil.middleware.js';

const router =
    Router();

router.get(
    '/config',
    getAuthConfig
);

router.get(
    '/me',
    requireMicrosoftAuth,
    loadPerfilLaboral,
    getCurrentUser
);

export default router;