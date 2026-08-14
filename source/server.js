import express from 'express';
import { supabase } from './configs/supabase.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

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

app.listen(port, () => {
    console.log(
        `Servidor ejecutándose en http://localhost:${port}`
    );
});