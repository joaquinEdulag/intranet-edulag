import {
    obtenerTokenGraph
} from '../configs/microsoft.js';

const GRAPH_BASE_URL =
    'https://graph.microsoft.com/v1.0';

function crearErrorGraph({
    status,
    statusText,
    detalle
}) {
    let mensajeGraph = detalle;
    let codigoGraph = null;

    try {
        const contenido = JSON.parse(detalle);

        codigoGraph =
            contenido?.error?.code ?? null;

        mensajeGraph =
            contenido?.error?.message
            || detalle;
    } catch {
        // Microsoft puede devolver texto en lugar de JSON.
    }

    const error = new Error(
        `Microsoft Graph respondió ${status} `
        + `${statusText}: ${mensajeGraph}`
    );

    error.status = status;
    error.graphCode = codigoGraph;
    error.graphDetail = detalle;

    return error;
}

export async function solicitarMicrosoftGraph(
    ruta,
    {
        method = 'GET',
        body,
        headers = {}
    } = {}
) {
    const token = await obtenerTokenGraph();

    const url = ruta.startsWith('https://')
        ? ruta
        : `${GRAPH_BASE_URL}${ruta.startsWith('/') ? '' : '/'}${ruta}`;

    const requestHeaders = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...headers
    };

    const opciones = {
        method,
        headers: requestHeaders
    };

    if (body !== undefined) {
        requestHeaders['Content-Type'] = 'application/json';
        opciones.body = JSON.stringify(body);
    }

    const respuesta = await fetch(
        url,
        opciones
    );

    if (!respuesta.ok) {
        const detalle = await respuesta.text();

        throw crearErrorGraph({
            status: respuesta.status,
            statusText: respuesta.statusText,
            detalle
        });
    }

    if (respuesta.status === 204) {
        return null;
    }

    const contenido = await respuesta.text();

    return contenido
        ? JSON.parse(contenido)
        : null;
}
