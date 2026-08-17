import {
    supabase
} from '../configs/supabase.js';

const CAMPOS_USUARIO = `
    id,
    numero_empleado,
    nombre_empleado,
    correo_microsoft,
    puesto,
    fecha_ingreso,
    entra_object_id,
    auth_user_id,
    metodo_autenticacion,
    activo,
    acceso_habilitado,
    id_area,
    id_turno
`;

function normalizarCorreo(correo) {
    return correo
        ?.trim()
        .toLowerCase();
}

function utilizaMicrosoft(authUser) {
    const provider =
        authUser.app_metadata?.provider;

    const providers =
        authUser.app_metadata?.providers ?? [];

    return (
        provider === 'azure' ||
        providers.includes('azure')
    );
}

async function buscarUsuarioLocal(
    authUserId,
    correo
) {
    const {
        data: usuarioPorAuth,
        error: authError
    } = await supabase
        .from('usuarios')
        .select(CAMPOS_USUARIO)
        .eq(
            'auth_user_id',
            authUserId
        )
        .maybeSingle();

    if (authError) {
        throw authError;
    }

    if (usuarioPorAuth) {
        return usuarioPorAuth;
    }

    const {
        data: usuarioPorCorreo,
        error: correoError
    } = await supabase
        .from('usuarios')
        .select(CAMPOS_USUARIO)
        .ilike(
            'correo_microsoft',
            correo
        )
        .maybeSingle();

    if (correoError) {
        throw correoError;
    }

    return usuarioPorCorreo;
}

export async function requireMicrosoftAuth(
    req,
    res,
    next
) {
    try {
        const authorization =
            req.headers.authorization;

        if (
            !authorization ||
            !authorization.startsWith('Bearer ')
        ) {
            return res.status(401).json({
                ok: false,
                codigo:
                    'SESION_NO_RECIBIDA',
                mensaje:
                    'No se recibió una sesión válida.'
            });
        }

        const accessToken =
            authorization
                .substring(7)
                .trim();

        if (!accessToken) {
            return res.status(401).json({
                ok: false,
                codigo:
                    'TOKEN_VACIO',
                mensaje:
                    'El token de autenticación está vacío.'
            });
        }

        const {
            data: authData,
            error: authError
        } = await supabase.auth.getUser(
            accessToken
        );

        if (
            authError ||
            !authData.user
        ) {
            return res.status(401).json({
                ok: false,
                codigo:
                    'SESION_INVALIDA',
                mensaje:
                    'La sesión no es válida o expiró.',
                error:
                    authError?.message ?? null
            });
        }

        const authUser =
            authData.user;

        if (!utilizaMicrosoft(authUser)) {
            return res.status(403).json({
                ok: false,
                codigo:
                    'PROVEEDOR_NO_PERMITIDO',
                mensaje:
                    'La cuenta no fue autenticada ' +
                    'mediante Microsoft.'
            });
        }

        const correo =
            normalizarCorreo(
                authUser.email
            );

        if (!correo) {
            return res.status(403).json({
                ok: false,
                codigo:
                    'CORREO_NO_RECIBIDO',
                mensaje:
                    'Microsoft no devolvió un correo.'
            });
        }

        if (
            !correo.endsWith(
                '@edulag.com'
            )
        ) {
            return res.status(403).json({
                ok: false,
                codigo:
                    'DOMINIO_NO_PERMITIDO',
                mensaje:
                    'Solamente se permiten cuentas ' +
                    'institucionales de EDULAG.'
            });
        }

        let usuario =
            await buscarUsuarioLocal(
                authUser.id,
                correo
            );

        if (!usuario) {
            return res.status(403).json({
                ok: false,
                codigo:
                    'EMPLEADO_NO_REGISTRADO',
                mensaje:
                    'La cuenta pertenece a EDULAG, ' +
                    'pero todavía no está vinculada ' +
                    'con un empleado local.',
                correo
            });
        }

        if (
            usuario.auth_user_id &&
            usuario.auth_user_id !==
                authUser.id
        ) {
            return res.status(403).json({
                ok: false,
                codigo:
                    'CUENTA_YA_VINCULADA',
                mensaje:
                    'Este empleado ya está vinculado ' +
                    'con otra cuenta.'
            });
        }

        if (!usuario.activo) {
            return res.status(403).json({
                ok: false,
                codigo:
                    'EMPLEADO_INACTIVO',
                mensaje:
                    'El empleado está inactivo.'
            });
        }

        if (!usuario.acceso_habilitado) {
            return res.status(403).json({
                ok: false,
                codigo:
                    'ACCESO_DESHABILITADO',
                mensaje:
                    'El empleado no tiene habilitado ' +
                    'el acceso a la aplicación.'
            });
        }

        if (
            usuario.metodo_autenticacion !==
            'MICROSOFT'
        ) {
            return res.status(403).json({
                ok: false,
                codigo:
                    'METODO_NO_PERMITIDO',
                mensaje:
                    'El empleado no tiene configurado ' +
                    'el acceso mediante Microsoft.'
            });
        }

        if (!usuario.auth_user_id) {
            const {
                data: usuarioVinculado,
                error: vinculacionError
            } = await supabase
                .from('usuarios')
                .update({
                    auth_user_id:
                        authUser.id
                })
                .eq(
                    'id',
                    usuario.id
                )
                .is(
                    'auth_user_id',
                    null
                )
                .select(CAMPOS_USUARIO)
                .single();

            if (vinculacionError) {
                throw vinculacionError;
            }

            usuario =
                usuarioVinculado;
        }

        req.authUser = {
            id:
                authUser.id,
            correo,
            proveedor:
                'Microsoft'
        };

        req.usuario =
            usuario;

        next();
    } catch (error) {
        console.error(
            'Error en autenticación:',
            error
        );

        return res.status(500).json({
            ok: false,
            codigo:
                'ERROR_AUTENTICACION',
            mensaje:
                'Ocurrió un error al validar ' +
                'la autenticación.',
            error:
                error.message
        });
    }
}