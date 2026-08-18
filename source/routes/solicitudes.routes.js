import {
    Router
} from 'express';

import {
    requireMicrosoftAuth
} from '../middlewares/auth.middleware.js';

import {
    loadPerfilLaboral,
    requirePerfilCompleto
} from '../middlewares/perfil.middleware.js';

import {
    crearAusenciaTemporal,
    crearEntradaSalida,
    crearHorasExtra,
    crearModificacionTurno,
    crearPermiso,
    crearVacaciones,
    listarCatalogos,
    listarMisSolicitudes,
    probarCreacionSolicitud
} from '../controllers/solicitudes.controller.js';

const router = Router();

router.use(
    requireMicrosoftAuth,
    loadPerfilLaboral,
    requirePerfilCompleto
);

router.post(
    '/prueba',
    probarCreacionSolicitud
);

router.post(
    '/entrada-salida',
    crearEntradaSalida
);

router.post('/horas-extra', crearHorasExtra);
router.post('/permisos', crearPermiso);
router.post('/ausencia-temporal', crearAusenciaTemporal);
router.post('/modificacion-turno', crearModificacionTurno);
router.post('/vacaciones', crearVacaciones);
router.get('/catalogos', listarCatalogos);
router.get('/mias', listarMisSolicitudes);

export default router;
