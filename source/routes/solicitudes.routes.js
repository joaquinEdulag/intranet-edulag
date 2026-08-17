import {
    Router
} from 'express';

import {
    requireMicrosoftAuth
} from '../middlewares/auth.middleware.js';

import {
    crearEntradaSalida,
    probarCreacionSolicitud
} from '../controllers/solicitudes.controller.js';

const router = Router();

router.use(
    requireMicrosoftAuth
);

router.post(
    '/prueba',
    probarCreacionSolicitud
);

router.post(
    '/entrada-salida',
    crearEntradaSalida
);

export default router;
