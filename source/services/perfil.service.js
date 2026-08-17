import {
    supabase
} from '../configs/supabase.js';

const NOMBRES_DIAS = {
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
    7: 'Domingo'
};

function validarResultado(
    resultado
) {
    if (resultado.error) {
        throw resultado.error;
    }

    return resultado.data;
}

export async function obtenerPerfilLaboral(
    usuario
) {
    const [
        areaResult,
        turnoResult,
        horarioResult,
        jefaturaResult
    ] = await Promise.all([
        supabase
            .from('area')
            .select(`
                id,
                nombre_area,
                activo
            `)
            .eq(
                'id',
                usuario.id_area
            )
            .maybeSingle(),

        supabase
            .from('turno')
            .select(`
                id,
                id_area,
                nombre_turno,
                horas_semanales,
                activo
            `)
            .eq(
                'id',
                usuario.id_turno
            )
            .eq(
                'id_area',
                usuario.id_area
            )
            .maybeSingle(),

        supabase
            .from('turno_horario')
            .select(`
                id,
                id_turno,
                dia_semana,
                hora_entrada,
                hora_salida,
                salida_dia_siguiente,
                minutos_descanso,
                activo
            `)
            .eq(
                'id_turno',
                usuario.id_turno
            )
            .eq(
                'activo',
                true
            )
            .order(
                'dia_semana',
                {
                    ascending: true
                }
            ),

        supabase
            .from('area_jefatura')
            .select(`
                id,
                id_area,
                id_jefe_usuario,
                cargo_jefatura,
                fecha_inicio,
                fecha_fin
            `)
            .eq(
                'id_area',
                usuario.id_area
            )
            .is(
                'fecha_fin',
                null
            )
            .maybeSingle()
    ]);

    const area =
        validarResultado(
            areaResult
        );

    const turno =
        validarResultado(
            turnoResult
        );

    const horario =
        validarResultado(
            horarioResult
        ) ?? [];

    const jefatura =
        validarResultado(
            jefaturaResult
        );

    let responsable = null;

    if (jefatura) {
        const jefeResult =
            await supabase
                .from('usuarios')
                .select(`
                    id,
                    numero_empleado,
                    nombre_empleado,
                    correo_microsoft,
                    puesto,
                    activo
                `)
                .eq(
                    'id',
                    jefatura.id_jefe_usuario
                )
                .maybeSingle();

        const jefe =
            validarResultado(
                jefeResult
            );

        if (jefe) {
            responsable = {
                id:
                    jefe.id,

                numeroEmpleado:
                    jefe.numero_empleado,

                nombre:
                    jefe.nombre_empleado,

                correo:
                    jefe.correo_microsoft,

                puesto:
                    jefe.puesto,

                cargoJefatura:
                    jefatura.cargo_jefatura,

                activo:
                    jefe.activo
            };
        }
    }

    const datosFaltantes = [];

    if (!area) {
        datosFaltantes.push(
            'area'
        );
    } else if (!area.activo) {
        datosFaltantes.push(
            'area_activa'
        );
    }

    if (!turno) {
        datosFaltantes.push(
            'turno'
        );
    } else if (!turno.activo) {
        datosFaltantes.push(
            'turno_activo'
        );
    }

    if (horario.length === 0) {
        datosFaltantes.push(
            'horario_turno'
        );
    }

    if (!responsable) {
        datosFaltantes.push(
            'responsable_aprobacion'
        );
    } else if (!responsable.activo) {
        datosFaltantes.push(
            'responsable_activo'
        );
    } else if (
        responsable.id === usuario.id
    ) {
        datosFaltantes.push(
            'responsable_es_solicitante'
        );
    }

    const puedeSolicitar =
        datosFaltantes.length === 0;

    const horarioFormateado =
        horario.map((dia) => ({
            id:
                dia.id,

            diaSemana:
                dia.dia_semana,

            dia:
                NOMBRES_DIAS[
                    dia.dia_semana
                ] ?? 'Desconocido',

            horaEntrada:
                dia.hora_entrada,

            horaSalida:
                dia.hora_salida,

            salidaDiaSiguiente:
                dia.salida_dia_siguiente,

            minutosDescanso:
                dia.minutos_descanso
        }));

    return {
        usuario: {
            id:
                usuario.id,

            numeroEmpleado:
                usuario.numero_empleado,

            nombre:
                usuario.nombre_empleado,

            correo:
                usuario.correo_microsoft,

            puesto:
                usuario.puesto,

            fechaIngreso:
                usuario.fecha_ingreso,

            entraObjectId:
                usuario.entra_object_id,

            activo:
                usuario.activo,

            accesoHabilitado:
                usuario.acceso_habilitado
        },

        area:
            area
                ? {
                    id:
                        area.id,

                    nombre:
                        area.nombre_area,

                    activo:
                        area.activo
                }
                : null,

        turno:
            turno
                ? {
                    id:
                        turno.id,

                    nombre:
                        turno.nombre_turno,

                    horasSemanales:
                        turno.horas_semanales,

                    activo:
                        turno.activo
                }
                : null,

        horario:
            horarioFormateado,

        responsable,

        perfil: {
            estado:
                puedeSolicitar
                    ? 'COMPLETO'
                    : 'PENDIENTE_CONFIGURACION',

            puedeSolicitar,

            datosFaltantes
        }
    };
}