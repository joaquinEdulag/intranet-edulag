import {
    supabase
} from '../configs/supabase.js';

// Estos datos identifican la versión del formato usada al crear la solicitud.
// Sustitúyelos por el código, revisión y fecha oficiales antes de producción.
const FORMATO_ENTRADA_SALIDA = {
    codigo: 'EDULAG-AUT-ENT-SAL',
    numeroRevision: 1,
    fechaRevision: '2026-08-15'
};

const FORMATOS = {
    HORAS_EXTRA: 'EDULAG-AUT-HXE',
    PERMISO_CON_GOCE: 'EDULAG-AUT-PCG',
    PERMISO_SIN_GOCE: 'EDULAG-AUT-PSG',
    ENTRADA_TARDE: 'EDULAG-AUT-ENT-SAL',
    SALIDA_TEMPRANO: 'EDULAG-AUT-ENT-SAL',
    AUSENCIA_TEMPORAL: 'EDULAG-AUT-AUT',
    MODIFICACION_TURNO: 'EDULAG-AUT-MDT',
    VACACIONES: 'EDULAG-AUT-VAC'
};

export async function crearSolicitud({
    idUsuario,
    tipo,
    detalle,
    contextoCliente = {}
}) {
    const codigoFormato = FORMATOS[tipo];

    if (!codigoFormato) {
        throw new Error('TIPO_NO_PERMITIDO: el tipo de solicitud no está habilitado.');
    }

    const { data, error } = await supabase.rpc(
        'crear_solicitud_laboral',
        {
            p_id_usuario: idUsuario,
            p_clave_tipo: tipo,
            p_detalle: detalle,
            p_codigo_formato: codigoFormato,
            p_numero_revision: 1,
            p_fecha_revision_formato: '2026-08-18',
            p_contexto_cliente: contextoCliente
        }
    );

    if (error) {
        const solicitudError = new Error(error.message || 'No fue posible crear la solicitud.');
        solicitudError.code = error.code;
        solicitudError.details = error.details;
        throw solicitudError;
    }

    return data;
}

export async function obtenerCatalogosSolicitud(idUsuario) {
    const [turnos, saldos] = await Promise.all([
        supabase.from('turno').select('id, id_area, nombre_turno, horas_semanales').eq('activo', true).order('nombre_turno'),
        supabase.from('saldo_vacaciones').select('id, periodo_inicio, periodo_fin, dias_otorgados, dias_reservados, dias_utilizados, dias_disponibles').eq('id_usuario', idUsuario).gte('periodo_fin', new Date().toISOString().slice(0, 10)).order('periodo_inicio')
    ]);

    if (turnos.error) throw new Error(`No fue posible consultar los turnos: ${turnos.error.message}`);
    if (saldos.error) throw new Error(`No fue posible consultar el saldo de vacaciones: ${saldos.error.message}`);
    return { turnos: turnos.data ?? [], saldosVacaciones: saldos.data ?? [] };
}

export async function obtenerSolicitudesUsuario(idUsuario) {
    const { data, error } = await supabase
        .from('solicitudes')
        .select('id, folio, fecha_solicitud, estado, tipo_solicitud:id_tipo_solicitud(clave,nombre)')
        .eq('id_usuario', idUsuario)
        .order('fecha_solicitud', { ascending: false })
        .limit(50);

    if (error) throw new Error(`No fue posible consultar las solicitudes: ${error.message}`);
    return data ?? [];
}

export async function crearSolicitudEntradaSalida({
    idUsuario,
    tipo,
    fecha,
    horaSolicitada,
    motivo,
    observaciones = null,
    contextoCliente = {}
}) {
    const {
        data,
        error
    } = await supabase.rpc(
        'crear_solicitud_entrada_salida',
        {
            p_id_usuario: idUsuario,
            p_clave_tipo: tipo,
            p_fecha: fecha,
            p_hora_solicitada: horaSolicitada,
            p_motivo: motivo,
            p_observaciones: observaciones,
            p_codigo_formato:
                FORMATO_ENTRADA_SALIDA.codigo,
            p_numero_revision:
                FORMATO_ENTRADA_SALIDA.numeroRevision,
            p_fecha_revision_formato:
                FORMATO_ENTRADA_SALIDA.fechaRevision,
            p_contexto_cliente: contextoCliente
        }
    );

    if (error) {
        const solicitudError = new Error(
            error.message ||
            'No fue posible crear la solicitud.'
        );

        solicitudError.code = error.code;
        solicitudError.details = error.details;
        solicitudError.hint = error.hint;

        throw solicitudError;
    }

    return data;
}

function requerirResultado(data, error, descripcion) {
    if (error) {
        throw new Error(
            `No fue posible consultar ${descripcion}: `
            + error.message
        );
    }

    if (!data) {
        throw new Error(
            `No se encontró ${descripcion}.`
        );
    }

    return data;
}

function requerirColeccion(data, error, descripcion) {
    if (error) {
        throw new Error(
            `No fue posible consultar ${descripcion}: `
            + error.message
        );
    }

    if (!Array.isArray(data) || data.length === 0) {
        throw new Error(
            `No se encontró ${descripcion}.`
        );
    }

    return data;
}

function construirResponsableEtapa({
    etapa,
    ordenEsperado,
    seguimientos,
    usuariosPorId
}) {
    const coincidencias = seguimientos.filter(
        seguimiento => seguimiento.etapa === etapa
    );

    if (coincidencias.length !== 1) {
        throw new Error(
            `La solicitud debe tener exactamente una etapa ${etapa}.`
        );
    }

    const seguimiento = coincidencias[0];

    if (Number(seguimiento.orden_etapa) !== ordenEsperado) {
        throw new Error(
            `La etapa ${etapa} debe tener el orden ${ordenEsperado}.`
        );
    }

    const usuario = usuariosPorId.get(
        Number(seguimiento.id_responsable_usuario)
    );

    if (!usuario) {
        throw new Error(
            `No se encontró el usuario responsable de la etapa ${etapa}.`
        );
    }

    const correo = String(
        seguimiento.correo_responsable_snapshot ??
        usuario.correo_microsoft ??
        ''
    ).trim().toLowerCase();

    if (!correo) {
        throw new Error(
            `El responsable de la etapa ${etapa} no tiene correo Microsoft.`
        );
    }

    return {
        idSeguimiento: seguimiento.id,
        etapa: seguimiento.etapa,
        orden: Number(seguimiento.orden_etapa),
        idUsuario: Number(
            seguimiento.id_responsable_usuario
        ),
        nombre: usuario.nombre_empleado,
        correo,
        puesto: usuario.puesto ?? null,
        estado: seguimiento.estado,
        comentario: seguimiento.comentario ?? null,
        idAprobacionMicrosoft:
            seguimiento.id_aprobacion_microsoft ?? null,
        fechaAsignacion:
            seguimiento.fecha_asignacion ?? null,
        fechaRespuesta:
            seguimiento.fecha_respuesta ?? null
    };
}

export async function obtenerEntradaSalidaParaSharePoint(
    idSolicitud
) {
    const solicitudId = Number(idSolicitud);

    if (
        !Number.isInteger(solicitudId) ||
        solicitudId <= 0
    ) {
        throw new Error(
            'El ID de solicitud debe ser un entero mayor que cero.'
        );
    }

    const {
        data: solicitud,
        error: errorSolicitud
    } = await supabase
        .from('solicitudes')
        .select(`
            id,
            id_usuario,
            id_tipo_solicitud,
            id_area,
            id_turno,
            id_jefe_usuario,
            fecha_solicitud,
            folio,
            codigo_formato,
            numero_revision,
            fecha_revision_formato,
            estado,
            contexto_snapshot
        `)
        .eq('id', solicitudId)
        .maybeSingle();

    requerirResultado(
        solicitud,
        errorSolicitud,
        `la solicitud ${solicitudId}`
    );

    const [
        resultadoTipo,
        resultadoSeguimientos
    ] = await Promise.all([
        supabase
            .from('tipo_solicitud')
            .select('clave, nombre')
            .eq(
                'id',
                solicitud.id_tipo_solicitud
            )
            .maybeSingle(),

        supabase
            .from('seguimiento_solicitud')
            .select(`
                id,
                etapa,
                orden_etapa,
                id_responsable_usuario,
                correo_responsable_snapshot,
                estado,
                comentario,
                id_aprobacion_microsoft,
                fecha_asignacion,
                fecha_respuesta
            `)
            .eq('id_solicitud', solicitudId)
            .order('orden_etapa', {
                ascending: true
            })
    ]);

    const tipo = requerirResultado(
        resultadoTipo.data,
        resultadoTipo.error,
        'el tipo de solicitud'
    );

    const tablasDetalle = {
        HORAS_EXTRA: 'horas_extra',
        PERMISO_CON_GOCE: 'permisos',
        PERMISO_SIN_GOCE: 'permisos',
        ENTRADA_TARDE: 'entrada_salida',
        SALIDA_TEMPRANO: 'entrada_salida',
        AUSENCIA_TEMPORAL: 'ausencia_temporal',
        MODIFICACION_TURNO: 'modificacion_turno',
        VACACIONES: 'vacaciones'
    };

    const tablaDetalle = tablasDetalle[tipo.clave];
    if (!tablaDetalle) {
        throw new Error(`El tipo ${tipo.clave} no está habilitado para sincronización.`);
    }

    const resultadoDetalle = await supabase
        .from(tablaDetalle)
        .select('*')
        .eq('id_solicitud', solicitudId)
        .maybeSingle();

    const detalle = requerirResultado(
        resultadoDetalle.data,
        resultadoDetalle.error,
        'el detalle de la solicitud'
    );

    const seguimientos = requerirColeccion(
        resultadoSeguimientos.data,
        resultadoSeguimientos.error,
        `las etapas de la solicitud ${solicitudId}`
    );

    const etapasRequeridas = [
        'JEFE',
        'ALTA_DIRECCION',
        'RH'
    ];

    const idsResponsables = [
        ...new Set(
            seguimientos
                .filter(seguimiento => (
                    etapasRequeridas.includes(
                        seguimiento.etapa
                    )
                ))
                .map(seguimiento => (
                    Number(
                        seguimiento.id_responsable_usuario
                    )
                ))
        )
    ];

    if (idsResponsables.length === 0) {
        throw new Error(
            'La solicitud no tiene responsables de aprobación configurados.'
        );
    }

    const {
        data: usuariosResponsables,
        error: errorResponsables
    } = await supabase
        .from('usuarios')
        .select(`
            id,
            nombre_empleado,
            correo_microsoft,
            puesto
        `)
        .in('id', idsResponsables);

    const responsables = requerirColeccion(
        usuariosResponsables,
        errorResponsables,
        'los usuarios responsables de aprobación'
    );

    const usuariosPorId = new Map(
        responsables.map(
            usuario => [Number(usuario.id), usuario]
        )
    );

    const aprobaciones = {
        jefe: construirResponsableEtapa({
            etapa: 'JEFE',
            ordenEsperado: 1,
            seguimientos,
            usuariosPorId
        }),
        altaDireccion: construirResponsableEtapa({
            etapa: 'ALTA_DIRECCION',
            ordenEsperado: 2,
            seguimientos,
            usuariosPorId
        }),
        rh: construirResponsableEtapa({
            etapa: 'RH',
            ordenEsperado: 3,
            seguimientos,
            usuariosPorId
        })
    };

    return {
        solicitud,
        tipo,
        detalle,
        aprobaciones
    };
}
