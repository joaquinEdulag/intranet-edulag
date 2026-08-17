import express from 'express';
import path from 'node:path';
import {
    fileURLToPath
} from 'node:url';

import {
    supabase
} from './configs/supabase.js';

import apiRoutes
    from './routes/index.js';

const app =
    express();

const port =
    process.env.PORT || 3000;

const currentFile =
    fileURLToPath(import.meta.url);

const currentDirectory =
    path.dirname(currentFile);

const publicDirectory =
    path.join(
        currentDirectory,
        'public'
    );

app.use(
    express.json()
);

app.use(
    express.static(
        publicDirectory
    )
);

app.get('/', (req, res) => {
    res.json({
        ok: true,
        mensaje:
            'Servidor de Edulag funcionando'
    });
});

app.get(
    '/api/health/supabase',
    async (req, res) => {
        try {
            const {
                data,
                error,
                count
            } = await supabase
                .from('tipo_solicitud')
                .select(
                    'id, clave, nombre',
                    {
                        count: 'exact'
                    }
                )
                .order('id');

            if (error) {
                return res
                    .status(500)
                    .json({
                        ok: false,
                        mensaje:
                            'No se pudo consultar Supabase',
                        error: {
                            message:
                                error.message,
                            code:
                                error.code,
                            details:
                                error.details,
                            hint:
                                error.hint
                        }
                    });
            }

            return res
                .status(200)
                .json({
                    ok: true,
                    mensaje:
                        'Conexión con Supabase correcta',
                    totalTiposSolicitud:
                        count,
                    tiposSolicitud:
                        data
                });
        } catch (error) {
            return res
                .status(500)
                .json({
                    ok: false,
                    mensaje:
                        'Error inesperado al probar Supabase',
                    error:
                        error.message
                });
        }
    }
);

app.use(
    '/api',
    apiRoutes
);

app.listen(port, () => {
    console.log(
        `Servidor ejecutándose en http://localhost:${port}`
    );
});