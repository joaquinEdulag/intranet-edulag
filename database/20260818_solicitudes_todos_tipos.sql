-- Ejecutar después del esquema canónico v3. Es seguro volver a ejecutarlo:
-- CREATE OR REPLACE actualiza la RPC sin eliminar solicitudes existentes.
-- Los jefes de área omiten su propia etapa y comienzan en Alta Dirección.
begin;

create or replace function public.crear_solicitud_laboral(
    p_id_usuario integer,
    p_clave_tipo varchar,
    p_detalle jsonb,
    p_codigo_formato varchar,
    p_numero_revision integer default 1,
    p_fecha_revision_formato date default date '2026-08-18',
    p_contexto_cliente jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
    v_u public.usuarios%rowtype;
    v_a public.area%rowtype;
    v_t public.turno%rowtype;
    v_tipo public.tipo_solicitud%rowtype;
    v_j public.area_jefatura%rowtype;
    v_jefe public.usuarios%rowtype;
    v_horario public.turno_horario%rowtype;
    v_saldo public.saldo_vacaciones%rowtype;
    v_id integer;
    v_folio varchar(30);
    v_prefijo varchar(4);
    v_dias numeric(5,2);
    v_inicio timestamptz;
    v_fin timestamptz;
    v_inicio_turno timestamp without time zone;
    v_fin_turno timestamp without time zone;
    v_hora_solicitada timestamp without time zone;
    v_minutos integer;
    v_es_jefe_area boolean;
    v_estado_inicial varchar(30);
    v_etapa_inicial varchar(20);
begin
    p_clave_tipo := upper(btrim(p_clave_tipo));
    if p_clave_tipo not in ('HORAS_EXTRA','PERMISO_CON_GOCE','PERMISO_SIN_GOCE','ENTRADA_TARDE','SALIDA_TEMPRANO','AUSENCIA_TEMPORAL','MODIFICACION_TURNO','VACACIONES') then
        raise exception 'TIPO_NO_PERMITIDO: el tipo de solicitud no está habilitado en esta función.';
    end if;
    if p_detalle is null or jsonb_typeof(p_detalle) <> 'object' then
        raise exception 'DETALLE_INVALIDO: los datos de la solicitud son obligatorios.';
    end if;

    select * into v_u from public.usuarios where id=p_id_usuario for share;
    if not found then raise exception 'USUARIO_NO_ENCONTRADO: el empleado no existe.'; end if;
    if not v_u.activo or not v_u.acceso_habilitado then raise exception 'USUARIO_NO_HABILITADO: el empleado está inactivo o no tiene acceso.'; end if;
    select * into v_a from public.area where id=v_u.id_area and activo;
    if not found then raise exception 'AREA_INVALIDA: el área está inactiva o no existe.'; end if;
    select * into v_t from public.turno where id=v_u.id_turno and id_area=v_u.id_area and activo;
    if not found then raise exception 'TURNO_INVALIDO: el turno actual no es válido.'; end if;
    select * into v_tipo from public.tipo_solicitud where clave=p_clave_tipo and activo;
    if not found then raise exception 'TIPO_NO_ENCONTRADO: el tipo está inactivo o no existe.'; end if;
    select * into v_j from public.area_jefatura where id_area=v_u.id_area and fecha_fin is null;
    if not found then raise exception 'RESPONSABLE_NO_CONFIGURADO: el área no tiene responsable vigente.'; end if;
    select * into v_jefe from public.usuarios where id=v_j.id_jefe_usuario and activo and acceso_habilitado;
    if not found or v_jefe.correo_microsoft is null then raise exception 'RESPONSABLE_INVALIDO: el responsable no está habilitado o no tiene correo.'; end if;
    v_es_jefe_area := v_jefe.id = v_u.id;
    v_estado_inicial := case when v_es_jefe_area then 'PENDIENTE_ALTA_DIRECCION' else 'PENDIENTE_JEFE' end;
    v_etapa_inicial := case when v_es_jefe_area then 'ALTA_DIRECCION' else 'JEFE' end;

    v_prefijo := case p_clave_tipo when 'HORAS_EXTRA' then 'HE' when 'PERMISO_CON_GOCE' then 'PCG' when 'PERMISO_SIN_GOCE' then 'PSG' when 'ENTRADA_TARDE' then 'ET' when 'SALIDA_TEMPRANO' then 'ST' when 'AUSENCIA_TEMPORAL' then 'AT' when 'MODIFICACION_TURNO' then 'MT' else 'VAC' end;
    v_folio := format('%s-%s-%s',v_prefijo,to_char(current_date,'YYYYMMDD'),lpad(nextval('public.folio_solicitud_seq'::regclass)::text,6,'0'));

    insert into public.solicitudes(id_usuario,id_creado_por,id_tipo_solicitud,id_area,id_turno,id_jefe_usuario,folio,codigo_formato,numero_revision,fecha_revision_formato,estado,contexto_snapshot)
    values(v_u.id,v_u.id,v_tipo.id,v_u.id_area,v_u.id_turno,v_jefe.id,v_folio,p_codigo_formato,p_numero_revision,p_fecha_revision_formato,v_estado_inicial,
        jsonb_build_object('version',1,'canal','INTRANET','solicitante',jsonb_build_object('id',v_u.id,'numeroEmpleado',v_u.numero_empleado,'nombre',v_u.nombre_empleado,'correo',v_u.correo_microsoft,'puesto',v_u.puesto),'area',jsonb_build_object('id',v_a.id,'nombre',v_a.nombre_area),'turno',jsonb_build_object('id',v_t.id,'nombre',v_t.nombre_turno,'horasSemanales',v_t.horas_semanales),'responsable',jsonb_build_object('id',v_jefe.id,'nombre',v_jefe.nombre_empleado,'correo',v_jefe.correo_microsoft,'cargo',v_j.cargo_jefatura),'flujoAprobacion',jsonb_build_object('solicitanteEsJefeArea',v_es_jefe_area,'primeraEtapa',v_etapa_inicial,'jefaturaOmitida',v_es_jefe_area),'cliente',coalesce(p_contexto_cliente,'{}'::jsonb))) returning id into v_id;

    if v_es_jefe_area then
        insert into public.seguimiento_solicitud(id_solicitud,etapa,orden_etapa,id_responsable_usuario,correo_responsable_snapshot,estado,comentario,fecha_respuesta)
        values(v_id,'JEFE',1,v_jefe.id,v_jefe.correo_microsoft,'CANCELADA','Etapa omitida: el solicitante es el jefe vigente de su área.',clock_timestamp());
    else
        insert into public.seguimiento_solicitud(id_solicitud,etapa,orden_etapa,id_responsable_usuario,correo_responsable_snapshot,estado)
        values(v_id,'JEFE',1,v_jefe.id,v_jefe.correo_microsoft,'PENDIENTE');
    end if;

    if p_clave_tipo='HORAS_EXTRA' then
        v_inicio := (p_detalle->>'fechaHoraInicio')::timestamptz; v_fin := (p_detalle->>'fechaHoraFin')::timestamptz;
        if v_inicio < clock_timestamp() or v_fin<=v_inicio or v_fin-v_inicio>interval '24 hours' then raise exception 'PERIODO_INVALIDO: las horas extra deben ser futuras y durar como máximo 24 horas.'; end if;
        insert into public.horas_extra(id_solicitud,fecha_hora_inicio,fecha_hora_fin,motivo,observaciones) values(v_id,v_inicio,v_fin,btrim(p_detalle->>'motivo'),nullif(btrim(p_detalle->>'observaciones'),''));
    elsif p_clave_tipo in ('PERMISO_CON_GOCE','PERMISO_SIN_GOCE') then
        v_dias := (p_detalle->>'diasSolicitados')::numeric;
        if (p_detalle->>'fechaInicio')::date<current_date or (p_detalle->>'fechaFin')::date<(p_detalle->>'fechaInicio')::date or v_dias<=0 then raise exception 'PERIODO_INVALIDO: revisa las fechas y los días solicitados.'; end if;
        insert into public.permisos(id_solicitud,fecha_inicio,fecha_fin,dias_solicitados,motivo,observaciones) values(v_id,(p_detalle->>'fechaInicio')::date,(p_detalle->>'fechaFin')::date,v_dias,btrim(p_detalle->>'motivo'),nullif(btrim(p_detalle->>'observaciones'),''));
    elsif p_clave_tipo in ('ENTRADA_TARDE','SALIDA_TEMPRANO') then
        select * into v_horario from public.turno_horario
        where id_turno=v_u.id_turno
          and dia_semana=extract(isodow from (p_detalle->>'fecha')::date)::smallint
          and activo;
        if not found then raise exception 'DIA_NO_LABORABLE: el turno no tiene horario activo para la fecha seleccionada.'; end if;
        if (p_detalle->>'fecha')::date<current_date then raise exception 'FECHA_INVALIDA: no se permiten solicitudes para fechas anteriores.'; end if;
        v_inicio_turno := (p_detalle->>'fecha')::date + v_horario.hora_entrada;
        v_fin_turno := (p_detalle->>'fecha')::date + v_horario.hora_salida;
        if v_horario.salida_dia_siguiente then v_fin_turno := v_fin_turno + interval '1 day'; end if;
        v_hora_solicitada := (p_detalle->>'fecha')::date + (p_detalle->>'horaSolicitada')::time;
        if v_horario.salida_dia_siguiente and (p_detalle->>'horaSolicitada')::time<v_horario.hora_entrada then v_hora_solicitada := v_hora_solicitada + interval '1 day'; end if;
        if p_clave_tipo='ENTRADA_TARDE' then
            if v_hora_solicitada<=v_inicio_turno or v_hora_solicitada>=v_fin_turno then raise exception 'HORA_INVALIDA: la entrada solicitada debe estar dentro de la jornada y ser posterior a la entrada normal.'; end if;
            v_minutos := floor(extract(epoch from (v_hora_solicitada-v_inicio_turno))/60)::integer;
        else
            if v_hora_solicitada<=v_inicio_turno or v_hora_solicitada>=v_fin_turno then raise exception 'HORA_INVALIDA: la salida solicitada debe estar dentro de la jornada y ser anterior a la salida normal.'; end if;
            v_minutos := floor(extract(epoch from (v_fin_turno-v_hora_solicitada))/60)::integer;
        end if;
        insert into public.entrada_salida(id_solicitud,fecha,hora_solicitada,minutos_solicitados,motivo,observaciones)
        values(v_id,(p_detalle->>'fecha')::date,(p_detalle->>'horaSolicitada')::time,v_minutos,btrim(p_detalle->>'motivo'),nullif(btrim(p_detalle->>'observaciones'),''));
    elsif p_clave_tipo='AUSENCIA_TEMPORAL' then
        v_inicio := (p_detalle->>'fechaHoraSalida')::timestamptz; v_fin := (p_detalle->>'fechaHoraRegreso')::timestamptz;
        if v_inicio<clock_timestamp() or v_fin<=v_inicio or v_fin::date<>v_inicio::date then raise exception 'PERIODO_INVALIDO: la salida y el regreso deben ocurrir el mismo día y en el futuro.'; end if;
        insert into public.ausencia_temporal(id_solicitud,fecha_hora_salida,fecha_hora_regreso,motivo,observaciones) values(v_id,v_inicio,v_fin,btrim(p_detalle->>'motivo'),nullif(btrim(p_detalle->>'observaciones'),''));
    elsif p_clave_tipo='MODIFICACION_TURNO' then
        if (p_detalle->>'idTurnoSolicitado')::integer=v_u.id_turno then raise exception 'TURNO_INVALIDO: selecciona un turno distinto al actual.'; end if;
        perform 1 from public.turno where id=(p_detalle->>'idTurnoSolicitado')::integer and activo; if not found then raise exception 'TURNO_INVALIDO: el turno solicitado no existe o está inactivo.'; end if;
        insert into public.modificacion_turno(id_solicitud,id_turno_actual,id_turno_solicitado,tipo_cambio,fecha_inicio,fecha_fin,motivo,observaciones) values(v_id,v_u.id_turno,(p_detalle->>'idTurnoSolicitado')::integer,upper(p_detalle->>'tipoCambio'),(p_detalle->>'fechaInicio')::date,nullif(p_detalle->>'fechaFin','')::date,btrim(p_detalle->>'motivo'),nullif(btrim(p_detalle->>'observaciones'),''));
    elsif p_clave_tipo='VACACIONES' then
        v_dias := (p_detalle->>'diasSolicitados')::numeric;
        select * into v_saldo from public.saldo_vacaciones where id=(p_detalle->>'idSaldoVacaciones')::integer and id_usuario=v_u.id for update;
        if not found then raise exception 'SALDO_NO_ENCONTRADO: el periodo de vacaciones no pertenece al empleado.'; end if;
        if v_dias<=0 or v_saldo.dias_disponibles<v_dias then raise exception 'SALDO_INSUFICIENTE: no hay suficientes días disponibles.'; end if;
        if (p_detalle->>'fechaInicio')::date<current_date or (p_detalle->>'fechaFin')::date<(p_detalle->>'fechaInicio')::date then raise exception 'PERIODO_INVALIDO: revisa las fechas de vacaciones.'; end if;
        insert into public.vacaciones(id_solicitud,id_saldo_vacaciones,fecha_inicio,fecha_fin,dias_solicitados,observaciones) values(v_id,v_saldo.id,(p_detalle->>'fechaInicio')::date,(p_detalle->>'fechaFin')::date,v_dias,nullif(btrim(p_detalle->>'observaciones'),''));
        update public.saldo_vacaciones set dias_reservados=dias_reservados+v_dias where id=v_saldo.id;
    end if;

    insert into public.historial_solicitud(id_solicitud,tipo_evento,etapa,estado_nuevo,id_actor_usuario,origen_evento,nombre_actor_snapshot,correo_actor_snapshot,comentario,datos_evento)
    values(v_id,'SOLICITUD_CREADA',v_etapa_inicial,v_estado_inicial,v_u.id,'APP',v_u.nombre_empleado,v_u.correo_microsoft,case when v_es_jefe_area then 'Solicitud creada; jefatura omitida por tratarse del jefe del área.' else 'Solicitud creada desde la intranet.' end,jsonb_build_object('tipo',p_clave_tipo,'solicitanteEsJefeArea',v_es_jefe_area,'jefaturaOmitida',v_es_jefe_area));
    return jsonb_build_object('idSolicitud',v_id,'folio',v_folio,'tipo',p_clave_tipo,'estado',v_estado_inicial,'jefaturaOmitida',v_es_jefe_area,'primeraEtapa',v_etapa_inicial);
exception when invalid_text_representation or datetime_field_overflow then
    raise exception 'FORMATO_INVALIDO: alguna fecha, hora o cantidad tiene un formato inválido.';
end;
$$;

revoke all on function public.crear_solicitud_laboral(integer,varchar,jsonb,varchar,integer,date,jsonb) from public, anon, authenticated;
grant execute on function public.crear_solicitud_laboral(integer,varchar,jsonb,varchar,integer,date,jsonb) to service_role;
commit;
