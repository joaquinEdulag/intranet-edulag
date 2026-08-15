import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabase } from './configs/supabase.js';

const app = express();
const port = process.env.PORT || 3000;

const currentFile =
    fileURLToPath(import.meta.url);

const currentDirectory =
    path.dirname(currentFile);

const publicDirectory =
    path.join(currentDirectory, 'public');

app.use(express.json());

app.use(
    express.static(publicDirectory)
);

app.get('/', (req, res) => {
    res.json({
        ok: true,
        mensaje: 'Servidor de Edulag funcionando'
    });
});

app.get('/api/health/supabase', async (req, res) => {
    try {
        const { data, error, count } = await supabase
            .from('tipo_solicitud')
            .select(
                'id, clave, nombre',
                {
                    count: 'exact'
                }
            )
            .order('id');

        if (error) {
            console.error(
                'Error de Supabase:',
                error
            );

            return res.status(500).json({
                ok: false,
                mensaje: 'No se pudo consultar Supabase',
                error: {
                    message: error.message,
                    code: error.code,
                    details: error.details,
                    hint: error.hint
                }
            });
        }

        return res.status(200).json({
            ok: true,
            mensaje: 'Conexión con Supabase correcta',
            totalTiposSolicitud: count,
            tiposSolicitud: data
        });
    } catch (error) {
        console.error(
            'Error inesperado:',
            error
        );

        return res.status(500).json({
            ok: false,
            mensaje: 'Error inesperado al probar Supabase',
            error: error.message
        });
    }
});

app.get('/api/auth/config', (req, res) => {
    const supabaseUrl =
        process.env.SUPABASE_URL?.trim();

    const supabasePublishableKey =
        process.env
            .SUPABASE_PUBLISHABLE_KEY
            ?.trim();

    if (
        !supabaseUrl ||
        !supabasePublishableKey
    ) {
        return res.status(500).json({
            ok: false,
            mensaje:
                'Falta SUPABASE_URL o ' +
                'SUPABASE_PUBLISHABLE_KEY en el .env.'
        });
    }

    return res.status(200).json({
        ok: true,
        supabaseUrl,
        supabasePublishableKey
    });
});

app.get('/api/auth/me', async (req, res) => {
    try {
        const authorization =
            req.headers.authorization;

        if (
            !authorization ||
            !authorization.startsWith('Bearer ')
        ) {
            return res.status(401).json({
                ok: false,
                mensaje:
                    'No se recibió una sesión válida.'
            });
        }

        const accessToken =
            authorization.substring(7).trim();

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
                mensaje:
                    'La sesión no es válida o expiró.',
                error:
                    authError?.message ?? null
            });
        }

        const authUser = authData.user;

        const providers =
            authUser.app_metadata?.providers ??
            [
                authUser.app_metadata?.provider
            ];

        if (!providers.includes('azure')) {
            return res.status(403).json({
                ok: false,
                mensaje:
                    'La cuenta no fue autenticada ' +
                    'mediante Microsoft.'
            });
        }

        if (!authUser.email) {
            return res.status(403).json({
                ok: false,
                mensaje:
                    'Microsoft no devolvió un correo ' +
                    'para este usuario.'
            });
        }

        let {
            data: empleado,
            error: empleadoError
        } = await supabase
            .from('usuarios')
            .select(`
                id,
                nombre_empleado,
                correo_microsoft,
                puesto,
                auth_user_id,
                metodo_autenticacion,
                activo,
                acceso_habilitado,
                id_area,
                id_turno
            `)
            .eq('auth_user_id', authUser.id)
            .maybeSingle();

        if (empleadoError) {
            throw empleadoError;
        }

        if (!empleado) {
            const {
                data: empleadoCorreo,
                error: correoError
            } = await supabase
                .from('usuarios')
                .select(`
                    id,
                    nombre_empleado,
                    correo_microsoft,
                    puesto,
                    auth_user_id,
                    metodo_autenticacion,
                    activo,
                    acceso_habilitado,
                    id_area,
                    id_turno
                `)
                .ilike(
                    'correo_microsoft',
                    authUser.email
                )
                .maybeSingle();

            if (correoError) {
                throw correoError;
            }

            empleado = empleadoCorreo;
        }

        if (!empleado) {
            return res.status(403).json({
                ok: false,
                mensaje:
                    'La cuenta Microsoft es válida, ' +
                    'pero no está registrada como ' +
                    'empleado autorizado en EDULAG.',
                correo: authUser.email
            });
        }

        if (
            empleado.auth_user_id &&
            empleado.auth_user_id !== authUser.id
        ) {
            return res.status(403).json({
                ok: false,
                mensaje:
                    'Este empleado ya está vinculado ' +
                    'con otra cuenta de autenticación.'
            });
        }

        if (!empleado.activo) {
            return res.status(403).json({
                ok: false,
                mensaje:
                    'El empleado se encuentra inactivo.'
            });
        }

        if (!empleado.acceso_habilitado) {
            return res.status(403).json({
                ok: false,
                mensaje:
                    'El empleado no tiene habilitado ' +
                    'el acceso a la aplicación.'
            });
        }

        if (
            empleado.metodo_autenticacion !==
            'MICROSOFT'
        ) {
            return res.status(403).json({
                ok: false,
                mensaje:
                    'El empleado no tiene configurado ' +
                    'el acceso mediante Microsoft.'
            });
        }

        if (!empleado.auth_user_id) {
            const {
                data: empleadoVinculado,
                error: vinculacionError
            } = await supabase
                .from('usuarios')
                .update({
                    auth_user_id: authUser.id
                })
                .eq('id', empleado.id)
                .is('auth_user_id', null)
                .select(`
                    id,
                    nombre_empleado,
                    correo_microsoft,
                    puesto,
                    auth_user_id,
                    metodo_autenticacion,
                    activo,
                    acceso_habilitado,
                    id_area,
                    id_turno
                `)
                .single();

            if (vinculacionError) {
                throw vinculacionError;
            }

            empleado = empleadoVinculado;
        }

        return res.status(200).json({
            ok: true,
            mensaje:
                'Inicio de sesión y autorización correctos.',
            autenticacion: {
                proveedor: 'Microsoft',
                correo: authUser.email,
                authUserId: authUser.id
            },
            empleado
        });
    } catch (error) {
        console.error(
            'Error al validar el acceso:',
            error
        );

        return res.status(500).json({
            ok: false,
            mensaje:
                'Ocurrió un error al validar el acceso.',
            error: error.message
        });
    }
});

app.listen(port, () => {
    console.log(
        `Servidor ejecutándose en http://localhost:${port}`
    );
});