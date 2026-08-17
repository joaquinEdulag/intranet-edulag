import {
    obtenerPerfilLaboral
} from '../services/perfil.service.js';

export async function loadPerfilLaboral(
    req,
    res,
    next
) {
    try {
        req.perfilLaboral =
            await obtenerPerfilLaboral(
                req.usuario
            );

        next();
    } catch (error) {
        console.error(
            'Error cargando perfil laboral:',
            error
        );

        return res.status(500).json({
            ok: false,
            codigo:
                'ERROR_CARGAR_PERFIL',
            mensaje:
                'No fue posible cargar ' +
                'el perfil laboral.',
            error:
                error.message
        });
    }
}

export function requirePerfilCompleto(
    req,
    res,
    next
) {
    const perfil =
        req.perfilLaboral?.perfil;

    if (!perfil) {
        return res.status(500).json({
            ok: false,
            codigo:
                'PERFIL_NO_CARGADO',
            mensaje:
                'El perfil laboral no fue cargado.'
        });
    }

    if (!perfil.puedeSolicitar) {
        return res.status(409).json({
            ok: false,
            codigo:
                'PERFIL_INCOMPLETO',
            mensaje:
                'Tu perfil laboral necesita ' +
                'configuración antes de crear solicitudes.',
            perfil
        });
    }

    next();
}