import {
    sharePointConfig
} from '../configs/sharepoint.js';

import {
    solicitarMicrosoftGraph
} from './m365.service.js';

function numeroEnteroPositivo(valor, nombre) {
    const numero = Number(valor);

    if (!Number.isInteger(numero) || numero <= 0) {
        throw new Error(
            `${nombre} debe ser un entero mayor que cero.`
        );
    }

    return numero;
}

function limpiarCampos(campos) {
    return Object.fromEntries(
        Object.entries(campos)
            .filter(([, valor]) => (
                valor !== undefined &&
                valor !== null &&
                valor !== ''
            ))
    );
}

function validarCamposRequeridos(campos) {
    const requeridos = [
        'Title',
        'SolicitudId',
        'TipoClave',
        'TipoNombre',
        'EstadoGeneral',
        'FechaSolicitud',
        'SolicitanteId',
        'SolicitanteNombre',
        'SolicitanteCorreo',
        'AreaId',
        'AreaNombre',
        'TurnoId',
        'TurnoNombre',
        'ResponsableId',
        'ResponsableNombre',
        'ResponsableCorreo',
        'CodigoFormato',
        'NumeroRevision',
        'FechaRevisionFormato',
        'ResultadoJefe',
        'AltaDireccionId',
        'AltaDireccionNombre',
        'AltaDireccionCorreo',
        'EstadoAltaDireccion',
        'RHId',
        'RHNombre',
        'CorreoRH',
        'EstadoRH',
        'NotificacionCierreEnviada',
        'PendienteSincronizarSupabase',
        'VersionIntegracion',
        'OrigenRegistro'
    ];

    const faltantes = requeridos.filter(
        nombre => (
            campos[nombre] === undefined ||
            campos[nombre] === null ||
            campos[nombre] === ''
        )
    );

    if (faltantes.length > 0) {
        throw new Error(
            'Faltan campos requeridos para SharePoint: '
            + faltantes.join(', ')
        );
    }
}

function rutaLista(sufijo = '') {
    // El identificador compuesto del sitio contiene comas y Graph lo
    // documenta directamente dentro de la ruta. Los valores ya fueron
    // obtenidos de la configuración generada para esta lista.
    const siteId = sharePointConfig.siteId;
    const listId = sharePointConfig.listId;

    return `/sites/${siteId}/lists/${listId}${sufijo}`;
}

export async function probarAccesoListaSharePoint() {
    return solicitarMicrosoftGraph(
        rutaLista('?$select=id,displayName,webUrl')
    );
}

export async function buscarElementoPorSolicitudId(
    idSolicitud
) {
    const solicitudId = numeroEnteroPositivo(
        idSolicitud,
        'idSolicitud'
    );

    const parametros = new URLSearchParams({
        '$expand': 'fields($select=Title,SolicitudId)',
        '$filter': `fields/SolicitudId eq ${solicitudId}`,
        '$top': '1'
    });

    const resultado = await solicitarMicrosoftGraph(
        rutaLista(`/items?${parametros.toString()}`),
        {
            headers: {
                Prefer:
                    'HonorNonIndexedQueriesWarningMayFailRandomly'
            }
        }
    );

    return resultado?.value?.[0] ?? null;
}

export async function crearElementoSolicitudSharePoint(
    campos
) {
    validarCamposRequeridos(campos);

    const solicitudId = numeroEnteroPositivo(
        campos.SolicitudId,
        'SolicitudId'
    );

    const existente =
        await buscarElementoPorSolicitudId(
            solicitudId
        );

    if (existente) {
        return {
            creado: false,
            motivo: 'YA_EXISTE',
            elemento: existente
        };
    }

    const elemento = await solicitarMicrosoftGraph(
        rutaLista('/items'),
        {
            method: 'POST',
            body: {
                fields: limpiarCampos(campos)
            }
        }
    );

    return {
        creado: true,
        motivo: 'CREADO',
        elemento
    };
}
