import {
    crearSolicitud,
    crearSolicitudEntradaSalida,
    obtenerCatalogosSolicitud,
    obtenerSolicitudesUsuario
} from '../services/solicitudes.service.js';

import {
    sincronizarSolicitudSharePoint
} from '../services/sincronizacion-sharepoint.service.js';

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

function texto(valor, maximo = 500, requerido = false) {
    const resultado = String(valor ?? '').trim();
    if ((requerido && !resultado) || resultado.length > maximo) return null;
    return resultado || null;
}

function fechaHoraValida(valor) {
    return typeof valor === 'string' && valor.length >= 16 && !Number.isNaN(new Date(valor).getTime());
}

async function responderCreacion(req, res, tipo, detalle) {
    try {
        const solicitud = await crearSolicitud({
            idUsuario: req.usuario.id,
            tipo,
            detalle,
            contextoCliente: {
                canal: 'INTRANET_WEB',
                userAgent: req.get('user-agent')?.slice(0, 300) ?? null
            }
        });

        return res.status(201).json({
            ok: true,
            mensaje: 'La solicitud fue enviada correctamente para aprobación.',
            solicitud
        });
    } catch (error) {
        console.error(`Error al crear ${tipo}:`, error);
        const negocio = obtenerErrorNegocio(error);
        return res.status(negocio ? 400 : 500).json({
            ok: false,
            codigo: negocio?.codigo ?? 'ERROR_CREACION_SOLICITUD',
            mensaje: negocio?.mensaje ?? 'No fue posible crear la solicitud.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

export async function crearHorasExtra(req, res) {
    const inicio = req.body?.fechaHoraInicio;
    const fin = req.body?.fechaHoraFin;
    const motivo = texto(req.body?.motivo, 500, true);
    const observaciones = texto(req.body?.observaciones);
    if (!fechaHoraValida(inicio) || !fechaHoraValida(fin) || new Date(fin) <= new Date(inicio) || !motivo) {
        return res.status(400).json({ ok: false, codigo: 'DATOS_INVALIDOS', mensaje: 'Revisa el periodo y el motivo de las horas extra.' });
    }
    return responderCreacion(req, res, 'HORAS_EXTRA', { fechaHoraInicio: inicio, fechaHoraFin: fin, motivo, observaciones });
}

export async function crearPermiso(req, res) {
    const tipo = String(req.body?.tipo ?? '').toUpperCase();
    const inicio = String(req.body?.fechaInicio ?? '');
    const fin = String(req.body?.fechaFin ?? '');
    const dias = Number(req.body?.diasSolicitados);
    const motivo = texto(req.body?.motivo, 500, true);
    if (!['PERMISO_CON_GOCE', 'PERMISO_SIN_GOCE'].includes(tipo) || !fechaISOValida(inicio) || !fechaISOValida(fin) || fin < inicio || !(dias > 0) || !motivo) {
        return res.status(400).json({ ok: false, codigo: 'DATOS_INVALIDOS', mensaje: 'Revisa el tipo, las fechas, los días y el motivo del permiso.' });
    }
    return responderCreacion(req, res, tipo, { fechaInicio: inicio, fechaFin: fin, diasSolicitados: dias, motivo, observaciones: texto(req.body?.observaciones) });
}

export async function crearAusenciaTemporal(req, res) {
    const salida = req.body?.fechaHoraSalida;
    const regreso = req.body?.fechaHoraRegreso;
    const motivo = texto(req.body?.motivo, 500, true);
    if (!fechaHoraValida(salida) || !fechaHoraValida(regreso) || new Date(regreso) <= new Date(salida) || !motivo) {
        return res.status(400).json({ ok: false, codigo: 'DATOS_INVALIDOS', mensaje: 'Revisa la hora de salida, regreso y el motivo.' });
    }
    return responderCreacion(req, res, 'AUSENCIA_TEMPORAL', { fechaHoraSalida: salida, fechaHoraRegreso: regreso, motivo, observaciones: texto(req.body?.observaciones) });
}

export async function crearModificacionTurno(req, res) {
    const idTurno = Number(req.body?.idTurnoSolicitado);
    const tipoCambio = String(req.body?.tipoCambio ?? '').toUpperCase();
    const inicio = String(req.body?.fechaInicio ?? '');
    const fin = req.body?.fechaFin ? String(req.body.fechaFin) : null;
    const motivo = texto(req.body?.motivo, 500, true);
    if (!Number.isInteger(idTurno) || idTurno <= 0 || !['TEMPORAL', 'PERMANENTE'].includes(tipoCambio) || !fechaISOValida(inicio) || (tipoCambio === 'TEMPORAL' && (!fechaISOValida(fin) || fin < inicio)) || !motivo) {
        return res.status(400).json({ ok: false, codigo: 'DATOS_INVALIDOS', mensaje: 'Revisa el turno solicitado, la vigencia y el motivo.' });
    }
    return responderCreacion(req, res, 'MODIFICACION_TURNO', { idTurnoSolicitado: idTurno, tipoCambio, fechaInicio: inicio, fechaFin: tipoCambio === 'TEMPORAL' ? fin : null, motivo, observaciones: texto(req.body?.observaciones) });
}

export async function crearVacaciones(req, res) {
    const idSaldo = Number(req.body?.idSaldoVacaciones);
    const inicio = String(req.body?.fechaInicio ?? '');
    const fin = String(req.body?.fechaFin ?? '');
    const dias = Number(req.body?.diasSolicitados);
    if (!Number.isInteger(idSaldo) || idSaldo <= 0 || !fechaISOValida(inicio) || !fechaISOValida(fin) || fin < inicio || !(dias > 0)) {
        return res.status(400).json({ ok: false, codigo: 'DATOS_INVALIDOS', mensaje: 'Revisa el periodo, las fechas y los días de vacaciones.' });
    }
    return responderCreacion(req, res, 'VACACIONES', { idSaldoVacaciones: idSaldo, fechaInicio: inicio, fechaFin: fin, diasSolicitados: dias, observaciones: texto(req.body?.observaciones) });
}

export async function listarCatalogos(req, res) {
    try {
        return res.json({ ok: true, ...(await obtenerCatalogosSolicitud(req.usuario.id)) });
    } catch (error) {
        return res.status(500).json({ ok: false, mensaje: error.message });
    }
}

export async function listarMisSolicitudes(req, res) {
    try {
        return res.json({ ok: true, solicitudes: await obtenerSolicitudesUsuario(req.usuario.id) });
    } catch (error) {
        return res.status(500).json({ ok: false, mensaje: error.message });
    }
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

        let sharePoint;

        try {
            sharePoint =
                await sincronizarSolicitudSharePoint(
                    solicitud.idSolicitud
                );
        } catch (errorSincronizacion) {
            console.error(
                'La solicitud fue creada, pero no se pudo iniciar '
                + 'la sincronización con SharePoint:',
                errorSincronizacion
            );

            sharePoint = {
                ok: false,
                estado: 'PENDIENTE',
                codigoError:
                    'ERROR_INICIO_SINCRONIZACION',
                ultimoError:
                    errorSincronizacion.message
            };
        }

        const sincronizada =
            sharePoint.estado === 'SINCRONIZADA';

        const sharePointPublico = {
            ...sharePoint,
            ultimoError:
                process.env.NODE_ENV === 'development'
                    ? sharePoint.ultimoError
                    : undefined
        };

        return res.status(201).json({
            ok: true,
            mensaje:
                sincronizada
                    ? 'La solicitud fue creada y sincronizada con SharePoint.'
                    : 'La solicitud fue creada correctamente y está pendiente de sincronización con SharePoint.',
            solicitud,
            sharePoint: sharePointPublico
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
