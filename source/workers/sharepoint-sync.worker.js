import {
    procesarSincronizacionesPendientes
} from '../services/sincronizacion-sharepoint.service.js';

function booleanoEntorno(valor, predeterminado) {
    if (valor === undefined) {
        return predeterminado;
    }

    return ![
        '0',
        'false',
        'no',
        'off'
    ].includes(
        String(valor).trim().toLowerCase()
    );
}

function enteroEntorno(
    valor,
    predeterminado,
    minimo,
    maximo
) {
    const numero = Number(valor);

    if (
        !Number.isInteger(numero) ||
        numero < minimo ||
        numero > maximo
    ) {
        return predeterminado;
    }

    return numero;
}

const habilitado = booleanoEntorno(
    process.env.SHAREPOINT_SYNC_ENABLED,
    true
);

const intervaloMs = enteroEntorno(
    process.env.SHAREPOINT_SYNC_INTERVAL_MS,
    60_000,
    15_000,
    3_600_000
);

const tamanoLote = enteroEntorno(
    process.env.SHAREPOINT_SYNC_BATCH_SIZE,
    20,
    1,
    100
);

let ejecutando = false;

async function ejecutarCiclo() {
    if (ejecutando) {
        return;
    }

    ejecutando = true;

    try {
        const resultado =
            await procesarSincronizacionesPendientes({
                limite: tamanoLote
            });

        if (resultado.reclamadas > 0) {
            console.log(
                '[SharePoint] Ciclo terminado:',
                {
                    reclamadas:
                        resultado.reclamadas,
                    sincronizadas:
                        resultado.sincronizadas,
                    errores:
                        resultado.errores
                }
            );
        }
    } catch (error) {
        console.error(
            '[SharePoint] El trabajador no pudo procesar la cola:',
            error.message
        );
    } finally {
        ejecutando = false;
    }
}

export function iniciarWorkerSharePoint() {
    if (!habilitado) {
        console.log(
            '[SharePoint] Trabajador automático deshabilitado.'
        );

        return null;
    }

    console.log(
        `[SharePoint] Reintentos activos cada ${intervaloMs} ms.`
    );

    void ejecutarCiclo();

    const temporizador = setInterval(
        ejecutarCiclo,
        intervaloMs
    );

    temporizador.unref();

    return temporizador;
}
