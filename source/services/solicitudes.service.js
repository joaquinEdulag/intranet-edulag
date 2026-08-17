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
