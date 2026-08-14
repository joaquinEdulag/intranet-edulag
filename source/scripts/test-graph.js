import {
    obtenerTokenGraph
} from '../configs/microsoft.js';

try {
    console.log(
        'Solicitando token de Microsoft Graph...'
    );

    const token = await obtenerTokenGraph();

    const parametros = new URLSearchParams({
        '$select': [
            'id',
            'displayName',
            'userPrincipalName',
            'employeeId',
            'department',
            'jobTitle',
            'accountEnabled',
            'userType'
        ].join(','),

        '$top': '1'
    });

    const url =
        'https://graph.microsoft.com/v1.0/users'
        + `?${parametros.toString()}`;

    const respuesta = await fetch(
        url,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json'
            }
        }
    );

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
        console.error(
            'Microsoft Graph rechazó la solicitud:'
        );

        console.error(
            JSON.stringify(
                resultado,
                null,
                2
            )
        );

        process.exitCode = 1;
    } else {
        const usuario = resultado.value?.[0];

        console.log(
            'Conexión con Microsoft Graph correcta.'
        );

        if (!usuario) {
            console.log(
                'La conexión fue correcta, pero Entra no devolvió usuarios.'
            );
        } else {
            console.table([
                {
                    nombre:
                        usuario.displayName ?? null,

                    upn:
                        usuario.userPrincipalName ?? null,

                    numeroEmpleado:
                        usuario.employeeId ?? null,

                    departamento:
                        usuario.department ?? null,

                    puesto:
                        usuario.jobTitle ?? null,

                    habilitado:
                        usuario.accountEnabled ?? null,

                    tipo:
                        usuario.userType ?? null
                }
            ]);
        }
    }
} catch (error) {
    console.error(
        'La prueba de Microsoft Graph falló:'
    );

    console.error(
        error.message
    );

    process.exitCode = 1;
}