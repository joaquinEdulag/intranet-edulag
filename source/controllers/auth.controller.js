export function getAuthConfig(
    req,
    res
) {
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
            codigo:
                'CONFIGURACION_INCOMPLETA',
            mensaje:
                'Falta SUPABASE_URL o ' +
                'SUPABASE_PUBLISHABLE_KEY ' +
                'en el archivo .env.'
        });
    }

    return res.status(200).json({
        ok: true,
        supabaseUrl,
        supabasePublishableKey
    });
}

export function getCurrentUser(
    req,
    res
) {
    return res.status(200).json({
        ok: true,

        mensaje:
            'Perfil del empleado consultado ' +
            'correctamente.',

        autenticacion: {
            proveedor:
                req.authUser.proveedor,

            correo:
                req.authUser.correo,

            authUserId:
                req.authUser.id
        },

        ...req.perfilLaboral
    });
}