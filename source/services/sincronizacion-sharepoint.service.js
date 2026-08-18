import {
    supabase
} from '../configs/supabase.js';

import {
    obtenerEntradaSalidaParaSharePoint
} from './solicitudes.service.js';

import {
    crearElementoSolicitudSharePoint
} from './sharepoint.service.js';

function fechaHoraISO(valor) {
    const fecha = new Date(valor);

    if (Number.isNaN(fecha.getTime())) {
        throw new Error(
            `Fecha y hora inválida: ${valor}`
        );
    }

    return fecha.toISOString();
}

function enteroPositivo(valor, nombre) {
    const numero = Number(valor);

    if (!Number.isInteger(numero) || numero <= 0) {
        throw new Error(
            `${nombre} debe ser un entero mayor que cero.`
        );
    }

    return numero;
}

function fechaHoraISOOpcional(valor) {
    if (valor === undefined || valor === null || valor === '') {
        return null;
    }

    return fechaHoraISO(valor);
}

function requerirResponsableAprobacion(
    responsable,
    nombreEtapa
) {
    const faltantes = [];

    if (!responsable) {
        throw new Error(
            `No se encontró el responsable de ${nombreEtapa}.`
        );
    }

    if (
        !Number.isInteger(Number(responsable.idUsuario)) ||
        Number(responsable.idUsuario) <= 0
    ) {
        faltantes.push('idUsuario');
    }

    if (!String(responsable.nombre ?? '').trim()) {
        faltantes.push('nombre');
    }

    if (!String(responsable.correo ?? '').trim()) {
        faltantes.push('correo');
    }

    if (!String(responsable.estado ?? '').trim()) {
        faltantes.push('estado');
    }

    if (faltantes.length > 0) {
        throw new Error(
            `El responsable de ${nombreEtapa} está incompleto: `
            + faltantes.join(', ')
        );
    }

    return responsable;
}

function limpiarMensajeError(error) {
    return String(
        error?.message ??
        'Error desconocido al sincronizar con SharePoint.'
    ).slice(0, 4000);
}

function calcularProximoReintento(intentos) {
    const exponente = Math.max(
        0,
        Math.min(Number(intentos) - 1, 6)
    );

    const minutos = Math.min(
        60,
        2 ** exponente
    );

    return new Date(
        Date.now() + minutos * 60_000
    ).toISOString();
}

function resumenRegistro(registro) {
    return {
        idSincronizacion: registro.id,
        idSolicitud: registro.id_solicitud,
        estado: registro.estado,
        intentos: registro.intentos,
        sharePointItemId:
            registro.sharepoint_item_id ?? null,
        fechaSincronizacion:
            registro.fecha_sincronizacion ?? null,
        proximoReintentoAt:
            registro.proximo_reintento_at ?? null,
        codigoError:
            registro.codigo_error ?? null,
        ultimoError:
            registro.ultimo_error ?? null
    };
}

export function construirCamposEntradaSalidaSharePoint({
    solicitud,
    tipo,
    detalle,
    aprobaciones
}) {
    const contexto =
        solicitud.contexto_snapshot ?? {};

    const solicitante =
        contexto.solicitante ?? {};

    const area =
        contexto.area ?? {};

    const turno =
        contexto.turno ?? {};

    const responsableContexto =
        contexto.responsable ?? {};

    const jefe = requerirResponsableAprobacion(
        aprobaciones?.jefe,
        'la jefatura del área'
    );

    const altaDireccion =
        requerirResponsableAprobacion(
            aprobaciones?.altaDireccion,
            'Alta Dirección'
        );

    const rh = requerirResponsableAprobacion(
        aprobaciones?.rh,
        'RH'
    );

    if (
        Number(solicitud.id_jefe_usuario) !==
        Number(jefe.idUsuario)
    ) {
        throw new Error(
            'La jefatura registrada en la solicitud no coincide '
            + 'con la etapa JEFE.'
        );
    }

    return {
        Title: solicitud.folio,
        SolicitudId: solicitud.id,
        TipoClave: tipo.clave,
        TipoNombre: tipo.nombre,
        EstadoGeneral: solicitud.estado,
        FechaSolicitud: fechaHoraISO(
            solicitud.fecha_solicitud
        ),

        SolicitanteId: solicitud.id_usuario,
        NumeroEmpleado:
            solicitante.numeroEmpleado ?? null,
        SolicitanteNombre: solicitante.nombre,
        SolicitanteCorreo: solicitante.correo,

        AreaId: solicitud.id_area,
        AreaNombre: area.nombre,
        TurnoId: solicitud.id_turno,
        TurnoNombre: turno.nombre,

        FechaEvento: detalle.fecha,
        HoraSolicitada: detalle.hora_solicitada,
        MinutosSolicitados:
            Number(detalle.minutos_solicitados),
        Motivo: detalle.motivo,
        Observaciones: detalle.observaciones,
        DetalleJson: JSON.stringify({
            version: 2,
            tipo: tipo.clave,
            detalle
        }),

        ResponsableId:
            jefe.idUsuario,
        ResponsableNombre:
            jefe.nombre,
        ResponsableCorreo:
            jefe.correo,
        CargoResponsable:
            responsableContexto.cargo ??
            jefe.puesto ??
            null,

        CodigoFormato:
            solicitud.codigo_formato,
        NumeroRevision:
            solicitud.numero_revision,
        FechaRevisionFormato:
            solicitud.fecha_revision_formato,

        ResultadoJefe: jefe.estado,
        ComentarioJefe: jefe.comentario,
        FechaRespuestaJefe:
            fechaHoraISOOpcional(
                jefe.fechaRespuesta
            ),
        AprobacionMicrosoftId:
            jefe.idAprobacionMicrosoft,

        AltaDireccionId:
            altaDireccion.idUsuario,
        AltaDireccionNombre:
            altaDireccion.nombre,
        AltaDireccionCorreo:
            altaDireccion.correo,
        EstadoAltaDireccion:
            altaDireccion.estado,
        ComentarioAltaDireccion:
            altaDireccion.comentario,
        FechaRespuestaAltaDireccion:
            fechaHoraISOOpcional(
                altaDireccion.fechaRespuesta
            ),
        AprobacionAltaDireccionMicrosoft:
            altaDireccion.idAprobacionMicrosoft,

        RHId: rh.idUsuario,
        RHNombre: rh.nombre,
        EstadoRH: rh.estado,
        ComentarioRH: rh.comentario,
        CorreoRH: rh.correo,
        FechaEnteradoRH:
            fechaHoraISOOpcional(
                rh.fechaRespuesta
            ),
        AprobacionRHMicrosoftId:
            rh.idAprobacionMicrosoft,

        NotificacionCierreEnviada: false,
        PendienteSincronizarSupabase: false,
        VersionIntegracion: 2,
        OrigenRegistro:
            contexto.canal ?? 'INTRANET'
    };
}

export async function obtenerEstadoSincronizacionSharePoint(
    idSolicitud
) {
    const solicitudId = enteroPositivo(
        idSolicitud,
        'idSolicitud'
    );

    const {
        data,
        error
    } = await supabase
        .from('sincronizacion_sharepoint')
        .select('*')
        .eq('id_solicitud', solicitudId)
        .maybeSingle();

    if (error) {
        throw new Error(
            'No fue posible consultar el estado de sincronización: '
            + error.message
        );
    }

    return data;
}

async function reclamarSincronizaciones({
    idSolicitud = null,
    limite = 20,
    forzar = false
} = {}) {
    const {
        data,
        error
    } = await supabase.rpc(
        'reclamar_sincronizaciones_sharepoint',
        {
            p_id_solicitud:
                idSolicitud === null
                    ? null
                    : enteroPositivo(
                        idSolicitud,
                        'idSolicitud'
                    ),
            p_limite: Number(limite),
            p_forzar: Boolean(forzar)
        }
    );

    if (error) {
        throw new Error(
            'No fue posible reclamar las sincronizaciones pendientes: '
            + error.message
        );
    }

    return data ?? [];
}

async function marcarSincronizada(
    registro,
    resultadoSharePoint
) {
    const itemId = String(
        resultadoSharePoint.elemento?.id ?? ''
    ).trim();

    if (!itemId) {
        throw new Error(
            'SharePoint no devolvió el ID del elemento.'
        );
    }

    const ahora = new Date().toISOString();

    const {
        data,
        error
    } = await supabase
        .from('sincronizacion_sharepoint')
        .update({
            estado: 'SINCRONIZADA',
            sharepoint_item_id: itemId,
            fecha_sincronizacion: ahora,
            proximo_reintento_at: null,
            ultimo_error: null,
            codigo_error: null,
            detalle_error: {}
        })
        .eq('id', registro.id)
        .eq('estado', 'PROCESANDO')
        .select('*')
        .single();

    if (error) {
        throw new Error(
            'El elemento llegó a SharePoint, pero no fue posible '
            + 'guardar el resultado de sincronización: '
            + error.message
        );
    }

    return data;
}

async function marcarError(registro, errorOriginal) {
    const mensaje = limpiarMensajeError(
        errorOriginal
    );

    const codigo = String(
        errorOriginal?.graphCode ??
        errorOriginal?.code ??
        'ERROR_SINCRONIZACION'
    ).slice(0, 100);

    const proximoReintentoAt =
        calcularProximoReintento(
            registro.intentos
        );

    const {
        data,
        error
    } = await supabase
        .from('sincronizacion_sharepoint')
        .update({
            estado: 'ERROR',
            ultimo_error: mensaje,
            codigo_error: codigo,
            detalle_error: {
                status:
                    errorOriginal?.status ?? null,
                graphCode:
                    errorOriginal?.graphCode ?? null,
                registradoAt:
                    new Date().toISOString()
            },
            proximo_reintento_at:
                proximoReintentoAt
        })
        .eq('id', registro.id)
        .eq('estado', 'PROCESANDO')
        .select('*')
        .single();

    if (error) {
        console.error(
            'No fue posible registrar el error de SharePoint:',
            error.message
        );

        return {
            ...registro,
            estado: 'ERROR',
            ultimo_error: mensaje,
            codigo_error: codigo,
            proximo_reintento_at:
                proximoReintentoAt
        };
    }

    return data;
}

async function procesarRegistro(registro) {
    try {
        const datos =
            await obtenerEntradaSalidaParaSharePoint(
                registro.id_solicitud
            );

        const campos =
            construirCamposEntradaSalidaSharePoint(
                datos
            );

        const resultadoSharePoint =
            await crearElementoSolicitudSharePoint(
                campos
            );

        const actualizado =
            await marcarSincronizada(
                registro,
                resultadoSharePoint
            );

        return {
            ok: true,
            creado:
                resultadoSharePoint.creado,
            motivo:
                resultadoSharePoint.motivo,
            ...resumenRegistro(actualizado)
        };
    } catch (error) {
        const actualizado =
            await marcarError(
                registro,
                error
            );

        return {
            ok: false,
            ...resumenRegistro(actualizado)
        };
    }
}

export async function sincronizarSolicitudSharePoint(
    idSolicitud,
    {
        forzar = false
    } = {}
) {
    const solicitudId = enteroPositivo(
        idSolicitud,
        'idSolicitud'
    );

    const reclamadas =
        await reclamarSincronizaciones({
            idSolicitud: solicitudId,
            limite: 1,
            forzar
        });

    if (reclamadas.length > 0) {
        return procesarRegistro(
            reclamadas[0]
        );
    }

    const actual =
        await obtenerEstadoSincronizacionSharePoint(
            solicitudId
        );

    if (!actual) {
        throw new Error(
            'La solicitud no tiene registro de sincronización. '
            + 'Ejecuta primero la migración de Supabase.'
        );
    }

    return {
        ok: actual.estado === 'SINCRONIZADA',
        creado: false,
        motivo: 'SIN_CAMBIOS',
        ...resumenRegistro(actual)
    };
}

export async function procesarSincronizacionesPendientes({
    limite = 20,
    forzar = false
} = {}) {
    const reclamadas =
        await reclamarSincronizaciones({
            limite,
            forzar
        });

    const resultados = [];

    for (const registro of reclamadas) {
        resultados.push(
            await procesarRegistro(registro)
        );
    }

    return {
        reclamadas: reclamadas.length,
        sincronizadas:
            resultados.filter(
                resultado => resultado.ok
            ).length,
        errores:
            resultados.filter(
                resultado => !resultado.ok
            ).length,
        resultados
    };
}
