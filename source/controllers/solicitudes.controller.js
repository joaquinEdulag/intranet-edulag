import {
    crearSolicitudEntradaSalida
} from '../services/solicitudes.service.js';

const TIPOS_ENTRADA_SALIDA = new Set([
    'ENTRADA_TARDE',
    'SALIDA_TEMPRANO'
]);

function fechaISOValida(fecha) {
    if (
        typeof fecha !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fecha)
    ) {
        return false;
    }

    const fechaUTC = new Date(
        `${fecha}T00:00:00.000Z`
    );

    return (
        !Number.isNaN(fechaUTC.getTime()) &&
        fechaUTC.toISOString().slice(0, 10) === fecha
    );
}

function normalizarHora(hora) {
    if (typeof hora !== 'string') {
        return null;
    }

    const coincidencia = hora.match(
        /^(\d{2}):(\d{2})(?::(\d{2}))?$/
    );

    if (!coincidencia) {
        return null;
    }

    const horas = Number(coincidencia[1]);
    const minutos = Number(coincidencia[2]);
    const segundos = Number(coincidencia[3] ?? 0);

    if (
        horas > 23 ||
        minutos > 59 ||
        segundos > 59
    ) {
        return null;
    }

    return [
        String(horas).padStart(2, '0'),
        String(minutos).padStart(2, '0'),
        String(segundos).padStart(2, '0')
    ].join(':');
}

function obtenerErrorNegocio(error) {
    const mensaje =
        error?.message ||
        'No fue posible crear la solicitud.';

    const coincidencia = mensaje.match(
        /^([A-Z][A-Z0-9_]+):\s*(.+)$/s
    );

    if (!coincidencia) {
        return null;
    }

    return {
        codigo: coincidencia[1],
        mensaje: coincidencia[2]
    };
}

export async function probarCreacionSolicitud(
    req,
    res
) {
    return res.status(200).json({
        ok: true,
        mensaje:
            'La autenticación del usuario es correcta. ' +
            'Las reglas laborales se validarán al enviar la solicitud real.',
        prueba: {
            solicitante: {
                id: req.usuario.id,
                nombre: req.usuario.nombre_empleado,
                correo: req.usuario.correo_microsoft
            }
        },
        importante:
            'Esta prueba no insertó datos. La función de PostgreSQL ' +
            'validará área, turno, horario y responsable antes de insertar.'
    });
}

export async function crearEntradaSalida(
    req,
    res
) {
    try {
        const tipo = String(
            req.body?.tipo ?? ''
        ).trim().toUpperCase();

        const fecha = String(
            req.body?.fecha ?? ''
        ).trim();

        const horaSolicitada = normalizarHora(
            req.body?.horaSolicitada
        );

        const motivo = String(
            req.body?.motivo ?? ''
        ).trim();

        const observacionesRaw =
            req.body?.observaciones;

        const observaciones =
            observacionesRaw === undefined ||
            observacionesRaw === null
                ? null
                : String(observacionesRaw).trim() || null;

        if (!TIPOS_ENTRADA_SALIDA.has(tipo)) {
            return res.status(400).json({
                ok: false,
                codigo: 'TIPO_NO_PERMITIDO',
                mensaje:
                    'Selecciona Entrada tarde o Salida temprano.'
            });
        }

        if (!fechaISOValida(fecha)) {
            return res.status(400).json({
                ok: false,
                codigo: 'FECHA_INVALIDA',
                mensaje:
                    'La fecha debe tener el formato AAAA-MM-DD.'
            });
        }

        if (!horaSolicitada) {
            return res.status(400).json({
                ok: false,
                codigo: 'HORA_INVALIDA',
                mensaje:
                    'La hora solicitada no es válida.'
            });
        }

        if (!motivo || motivo.length > 500) {
            return res.status(400).json({
                ok: false,
                codigo: 'MOTIVO_INVALIDO',
                mensaje:
                    'El motivo es obligatorio y no debe superar 500 caracteres.'
            });
        }

        if (
            observaciones &&
            observaciones.length > 500
        ) {
            return res.status(400).json({
                ok: false,
                codigo: 'OBSERVACIONES_INVALIDAS',
                mensaje:
                    'Las observaciones no deben superar 500 caracteres.'
            });
        }

        const solicitud =
            await crearSolicitudEntradaSalida({
                idUsuario: req.usuario.id,
                tipo,
                fecha,
                horaSolicitada,
                motivo,
                observaciones,
                contextoCliente: {
                    canalPrueba: 'HTML',
                    userAgent:
                        req.get('user-agent')
                            ?.slice(0, 300) ?? null
                }
            });

        return res.status(201).json({
            ok: true,
            mensaje:
                'La solicitud fue creada y enviada al responsable.',
            solicitud
        });
    } catch (error) {
        console.error(
            'Error al crear la solicitud de entrada/salida:',
            error
        );

        const errorNegocio =
            obtenerErrorNegocio(error);

        if (errorNegocio) {
            return res.status(400).json({
                ok: false,
                ...errorNegocio
            });
        }

        return res.status(500).json({
            ok: false,
            codigo: 'ERROR_CREACION_SOLICITUD',
            mensaje:
                'No fue posible crear la solicitud.',
            error:
                process.env.NODE_ENV === 'development'
                    ? error.message
                    : undefined
        });
    }
}
