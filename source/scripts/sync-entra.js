import {
    sincronizarUsuariosEntra
} from '../services/entra.service.js';

try {
    console.log(
        'Iniciando sincronización con Microsoft Entra...'
    );

    const resultado =
        await sincronizarUsuariosEntra();

    console.log(
        'Sincronización terminada correctamente:'
    );

    console.table(resultado);
} catch (error) {
    console.error(
        'La sincronización falló:',
        error.message
    );

    process.exitCode = 1;
}