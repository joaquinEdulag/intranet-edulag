import {
    probarAccesoListaSharePoint
} from '../services/sharepoint.service.js';

import {
    sincronizarSolicitudSharePoint
} from '../services/sincronizacion-sharepoint.service.js';

const idSolicitud = Number(
    process.argv[2]
);

if (
    !Number.isInteger(idSolicitud) ||
    idSolicitud <= 0
) {
    console.error(
        'Uso: pnpm test:sharepoint <id_solicitud>'
    );
    process.exitCode = 1;
}
else {
    try {
        console.log(
            'Comprobando acceso a SharePoint...'
        );

        const lista =
            await probarAccesoListaSharePoint();

        console.log(
            `Lista encontrada: ${lista.displayName}`
        );

        console.log(
            `Procesando solicitud ${idSolicitud}...`
        );

        const resultado =
            await sincronizarSolicitudSharePoint(
                idSolicitud,
                {
                    forzar: true
                }
            );

        if (!resultado.ok) {
            console.log(
                'La solicitud quedó pendiente de reintento.'
            );

            process.exitCode = 1;
        }
        else {
            console.log(
                resultado.creado
                    ? 'Solicitud creada correctamente en SharePoint.'
                    : 'La solicitud ya estaba sincronizada; no se duplicó.'
            );
        }

        console.log(resultado);
    } catch (error) {
        console.error(
            'La prueba de SharePoint falló:',
            error.message
        );

        if (error.status === 403) {
            console.error(
                'Revisa Lists.SelectedOperations.Selected, '
                + 'el consentimiento administrativo y el permiso write de la lista.'
            );
        }

        process.exitCode = 1;
    }
}
