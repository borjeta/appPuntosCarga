import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  RELIABILITY_WINDOW_DAYS,
  reliabilityScore,
  type CommunityReport,
  type CommunitySummary,
  type ReportType,
} from '@pc/shared';
import { AppState, Platform } from 'react-native';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

/**
 * Supabase solo se usa para la comunidad (avisos). Si no está configurado, la app funciona igual
 * y la sección de comunidad se muestra desactivada.
 */
export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

// Recomendación de Supabase: refrescar la sesión solo con la app en primer plano.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const EMPTY_COMMUNITY: CommunitySummary = {
  reliability: null,
  works30d: 0,
  problems30d: 0,
  recent: [],
};

export class CommunityError extends Error {}

export async function communitySummary(stationId: string): Promise<CommunitySummary> {
  if (!supabase) return { ...EMPTY_COMMUNITY, disabled: true };
  const since = new Date(Date.now() - RELIABILITY_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('community_reports')
    .select('type, comment, created_at')
    .eq('station_id', stationId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw new CommunityError(error.message);
  const reports: CommunityReport[] = (data ?? []).map((r) => ({
    type: r.type as ReportType,
    comment: r.comment as string | null,
    createdAt: r.created_at as string,
  }));
  const monthAgo = Date.now() - 30 * 86_400_000;
  return {
    ...reliabilityScore(reports),
    recent: reports.filter((r) => Date.parse(r.createdAt) >= monthAgo).slice(0, 10),
  };
}

/** Envía un aviso. Inicia sesión anónima la primera vez (Supabase Auth). */
export async function sendReport(
  stationId: string,
  type: ReportType,
  comment?: string,
): Promise<CommunitySummary> {
  if (!supabase) throw new CommunityError('La comunidad no está configurada en esta versión.');
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw new CommunityError(`No se pudo iniciar sesión: ${error.message}`);
  }
  const { error } = await supabase
    .from('community_reports')
    .insert({ station_id: stationId, type, comment: comment || null });
  if (error) {
    if (/rate_limit/.test(error.message)) {
      throw new CommunityError('Has enviado demasiados avisos hoy. Inténtalo mañana.');
    }
    throw new CommunityError(error.message);
  }
  return communitySummary(stationId);
}

/**
 * Borra la cuenta anónima y todos sus avisos en el servidor (requisito de la App Store y del RGPD).
 * Si nunca se envió un aviso no hay cuenta que borrar.
 */
export async function deleteMyCommunityData(): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw new CommunityError(error.message);
  // El servidor responde 403 a este cierre de sesión (el usuario ya no existe); supabase-js lo
  // ignora y limpia la sesión local, que es lo que importa.
  await supabase.auth.signOut({ scope: 'local' });
}
