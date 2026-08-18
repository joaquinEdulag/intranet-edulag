import {
    procesarSincronizacionesPendientes
} from '../services/sincronizacion-sharepoint.service.js';

const forzar =
    process.argv.includes('--force');

const limiteArgumento =
    process.argv.find(
        argumento => argumento.startsWith('--limit=')
    );

const limite = limiteArgumento
    ? Number(limiteArgumento.split('=')[1])
    : 20;

if (
    !Number.isInteger(limite) ||
    limite < 1 ||
    limite > 100
) {
    console.error(
        'El parámetro --limit debe estar entre 1 y 100.'
    );

    process.exitCode = 1;
}
else {
    try {
        console.log(
            'Procesando sincronizaciones pendientes de SharePoint...'
        );

        const resultado =
            await procesarSincronizacionesPendientes({
                limite,
                forzar
            });

        console.table(
            resultado.resultados.map(item => ({
                idSolicitud:
                    item.idSolicitud,
                estado:
                    item.estado,
                intentos:
                    item.intentos,
                sharePointItemId:
                    item.sharePointItemId,
                codigoError:
                    item.codigoError
            }))
        );

        console.log({
            reclamadas:
                resultado.reclamadas,
            sincronizadas:
                resultado.sincronizadas,
            errores:
                resultado.errores,
            forzado:
                forzar
        });

        if (resultado.errores > 0) {
            process.exitCode = 1;
        }
    } catch (error) {
        console.error(
            'La sincronización manual falló:',
            error.message
        );

        process.exitCode = 1;
    }
}
