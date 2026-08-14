import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY?.trim();

if (!supabaseUrl) {
    throw new Error(
        'No se encontró SUPABASE_URL en el archivo .env'
    );
}

if (!supabaseSecretKey) {
    throw new Error(
        'No se encontró SUPABASE_SECRET_KEY en el archivo .env'
    );
}

export const supabase = createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    }
);