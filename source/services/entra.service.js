import { supabase } from '../configs/supabase.js';
import { obtenerTokenGraph }
    from '../configs/microsoft.js';

const camposUsuario = [
    'id',
    'displayName',
    'mail',
    'userPrincipalName',
    'jobTitle',
    'department',
    'employeeId',
    'accountEnabled',
    'userType',
    'createdDateTime'
];

function dividirEnBloques(elementos, tamano) {
    const bloques = [];

    for (
        let posicion = 0;
        posicion < elementos.length;
        posicion += tamano
    ) {
        bloques.push(
            elementos.slice(
                posicion,
                posicion + tamano
            )
        );
    }

    return bloques;
}

async function obtenerUsuariosGraph() {
    const token = await obtenerTokenGraph();

    const parametros = new URLSearchParams({
        '$select': camposUsuario.join(','),
        '$top': '999'
    });

    let siguientePagina =
        'https://graph.microsoft.com/v1.0/users'
        + `?${parametros.toString()}`;

    const usuarios = [];

    while (siguientePagina) {
        const respuesta = await fetch(
            siguientePagina,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json'
                }
            }
        );

        if (!respuesta.ok) {
            const detalle = await respuesta.text();

            throw new Error(
                `Microsoft Graph respondió `
                + `${respuesta.status}: ${detalle}`
            );
        }

        const resultado = await respuesta.json();

        usuarios.push(
            ...(resultado.value ?? [])
        );

        siguientePagina =
            resultado['@odata.nextLink'] ?? null;
    }

    return usuarios;
}

async function guardarUsuariosEntra(
    usuariosMicrosoft
) {
    const fechaSincronizacion =
        new Date().toISOString();

    const filas = usuariosMicrosoft
        .filter(
            usuario =>
                usuario.userType === 'Member'
        )
        .map(usuario => ({
            entra_object_id: usuario.id,

            numero_empleado:
                usuario.employeeId?.trim()
                || null,

            nombre_empleado:
                usuario.displayName?.trim()
                || usuario.userPrincipalName,

            correo_microsoft:
                usuario.mail?.trim()
                || usuario.userPrincipalName?.trim()
                || null,

            user_principal_name:
                usuario.userPrincipalName.trim(),

            puesto:
                usuario.jobTitle?.trim()
                || null,

            departamento_entra:
                usuario.department?.trim()
                || null,

            cuenta_habilitada:
                usuario.accountEnabled !== false,

            tipo_usuario:
                usuario.userType,

            datos_origen: usuario,

            ultima_sincronizacion_at:
                fechaSincronizacion
        }));

    const bloques = dividirEnBloques(
        filas,
        500
    );

    for (const bloque of bloques) {
        const { error } = await supabase
            .from('usuarios_entra')
            .upsert(
                bloque,
                {
                    onConflict: 'entra_object_id'
                }
            );

        if (error) {
            throw new Error(
                `Error guardando usuarios en Supabase: `
                + error.message
            );
        }
    }

    return filas.length;
}

async function provisionarUsuariosMapeados() {
    const {
        data: usuariosEntra,
        error: errorUsuarios
    } = await supabase
        .from('usuarios_entra')
        .select('*')
        .eq('tipo_usuario', 'Member');

    if (errorUsuarios) {
        throw new Error(
            errorUsuarios.message
        );
    }

    const {
        data: mapeos,
        error: errorMapeos
    } = await supabase
        .from('mapeo_departamento_entra')
        .select('*');

    if (errorMapeos) {
        throw new Error(
            errorMapeos.message
        );
    }

    const normalizar = valor =>
        valor?.trim().toLocaleLowerCase('es-MX');

    const mapeosPorDepartamento =
        new Map(
            mapeos.map(mapeo => [
                normalizar(
                    mapeo.departamento_entra
                ),
                mapeo
            ])
        );

    let vinculados = 0;
    let pendientes = 0;
    let desactivados = 0;

    for (const usuarioEntra of usuariosEntra) {
        if (!usuarioEntra.cuenta_habilitada) {
            if (usuarioEntra.id_usuario) {
                const { error } = await supabase
                    .from('usuarios')
                    .update({
                        activo: false,
                        sincronizado_entra_at:
                            new Date().toISOString()
                    })
                    .eq(
                        'id',
                        usuarioEntra.id_usuario
                    );

                if (error) {
                    throw new Error(
                        error.message
                    );
                }

                desactivados++;
            }

            continue;
        }

        const mapeo =
            mapeosPorDepartamento.get(
                normalizar(
                    usuarioEntra.departamento_entra
                )
            );

        if (!mapeo) {
            await supabase
                .from('usuarios_entra')
                .update({
                    estado_vinculacion:
                        'PENDIENTE',

                    motivo_pendiente:
                        'El departamento no tiene equivalencia local.'
                })
                .eq(
                    'entra_object_id',
                    usuarioEntra.entra_object_id
                );

            pendientes++;
            continue;
        }

        if (!mapeo.id_turno_default) {
            await supabase
                .from('usuarios_entra')
                .update({
                    estado_vinculacion:
                        'PENDIENTE',

                    motivo_pendiente:
                        'El departamento no tiene turno predeterminado.'
                })
                .eq(
                    'entra_object_id',
                    usuarioEntra.entra_object_id
                );

            pendientes++;
            continue;
        }

        const datosUsuario = {
            numero_empleado:
                usuarioEntra.numero_empleado,

            nombre_empleado:
                usuarioEntra.nombre_empleado,

            correo_microsoft:
                usuarioEntra.correo_microsoft,

            puesto:
                usuarioEntra.puesto,

            id_area:
                mapeo.id_area,

            id_turno:
                mapeo.id_turno_default,

            activo: true,

            entra_object_id:
                usuarioEntra.entra_object_id,

            sincronizado_entra_at:
                new Date().toISOString()
        };

        const {
            data: usuarioLocal,
            error: errorUsuario
        } = await supabase
            .from('usuarios')
            .upsert(
                datosUsuario,
                {
                    onConflict: 'entra_object_id'
                }
            )
            .select('id')
            .single();

        if (errorUsuario) {
            await supabase
                .from('usuarios_entra')
                .update({
                    estado_vinculacion: 'ERROR',
                    motivo_pendiente:
                        errorUsuario.message
                })
                .eq(
                    'entra_object_id',
                    usuarioEntra.entra_object_id
                );

            pendientes++;
            continue;
        }

        const { error: errorVinculacion } =
            await supabase
                .from('usuarios_entra')
                .update({
                    id_usuario: usuarioLocal.id,
                    estado_vinculacion:
                        'VINCULADO',
                    motivo_pendiente: null
                })
                .eq(
                    'entra_object_id',
                    usuarioEntra.entra_object_id
                );

        if (errorVinculacion) {
            throw new Error(
                errorVinculacion.message
            );
        }

        vinculados++;
    }

    return {
        vinculados,
        pendientes,
        desactivados
    };
}

export async function sincronizarUsuariosEntra() {
    const usuariosMicrosoft =
        await obtenerUsuariosGraph();

    const recibidos =
        await guardarUsuariosEntra(
            usuariosMicrosoft
        );

    const provisionamiento =
        await provisionarUsuariosMapeados();

    return {
        recibidos,
        ...provisionamiento
    };
}