// Comprueba las reglas de seguridad (RLS) de la tabla de avisos contra un Supabase real o local.
// Uso: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node supabase/tests/rls-check.mjs
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../apps/mobile/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const SB_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY; // la que imprime 'npx supabase status'
if (!KEY) throw new Error('Define SUPABASE_PUBLISHABLE_KEY');
const mk = () => createClient(SB_URL, KEY, { auth: { persistSession: false } });
const ok = (c, m) => console.log(`${c ? '✔' : '✖'} ${m}`);
const st = 'es:TEST-' + Date.now();

const anon = mk();
let r = await anon.from('community_reports').select('station_id,type,comment,created_at').eq('station_id', st);
ok(!r.error, `lectura sin sesión permitida (${r.error?.message ?? 'ok'})`);
r = await anon.from('community_reports').insert({ station_id: st, type: 'WORKS' });
ok(!!r.error, `escritura sin sesión rechazada (${r.error?.code} ${r.error?.message})`);

const a = mk();
const s = await a.auth.signInAnonymously();
ok(!s.error && s.data.user?.is_anonymous, `inicio de sesión anónimo (${s.error?.message ?? s.data.user.id.slice(0, 8)})`);
r = await a.from('community_reports').insert({ station_id: st, type: 'WORKS', comment: '  cargó   bien ' });
ok(!r.error, `aviso propio insertado (${r.error?.message ?? 'ok'})`);
r = await a.from('community_reports').select('*').eq('station_id', st);
ok(!!r.error, `select * rechazado: no se exponen user_id/hidden (${r.error?.code})`);
r = await a.from('community_reports').select('user_id').eq('station_id', st);
ok(!!r.error, `leer user_id rechazado (${r.error?.code})`);
r = await a.from('community_reports').insert({ station_id: st, type: 'WORKS', user_id: '00000000-0000-0000-0000-000000000000' });
ok(!!r.error, `suplantar user_id rechazado (${r.error?.code})`);
r = await a.from('community_reports').insert({ station_id: st, type: 'BROKEN', hidden: false });
ok(!!r.error, `fijar hidden rechazado (${r.error?.code})`);
r = await a.from('community_reports').insert({ station_id: 'no valido', type: 'WORKS' });
ok(!!r.error, `id de estación inválido rechazado (${r.error?.code})`);
r = await a.from('community_reports').insert({ station_id: st, type: 'BROKEN', comment: 'mira www.spam.example' });
ok(!r.error, `aviso con enlace aceptado (${r.error?.message ?? 'ok'})`);
r = await a.from('community_reports').insert({ station_id: st, type: 'BROKEN' });
ok(!r.error, `3.er aviso válido aceptado (${r.error?.message ?? 'ok'})`);
r = await a.from('community_reports').insert({ station_id: st, type: 'BROKEN' });
ok(!!r.error && /rate_limit/.test(r.error.message), `4.º aviso en la misma estación rechazado (${r.error?.message})`);
r = await a.from('community_reports').update({ hidden: true }).eq('station_id', st).select();
ok(!!r.error || (r.data ?? []).length === 0, `modificar avisos rechazado (${r.error?.code ?? 'sin filas'})`);
r = await a.from('community_reports').delete().eq('station_id', st).select();
ok(!!r.error || (r.data ?? []).length === 0, `borrar avisos rechazado (${r.error?.code ?? 'sin filas'})`);

r = await anon.from('community_reports').select('station_id,type,comment,created_at').eq('station_id', st);
ok(!r.error && r.data.length === 2 && r.data.some((x) => x.comment === 'cargó bien') && !r.data.some((x) => x.comment?.includes('www')), `lectura pública: ${JSON.stringify(r.data)} (el del enlace queda oculto, comentario limpio)`);

// Borrado de cuenta (requisito de la App Store): solo la propia, y se lleva sus avisos.
r = await anon.rpc('delete_my_account');
ok(!!r.error, `borrar cuenta sin sesión rechazado (${r.error?.code})`);
const b = mk();
await b.auth.signInAnonymously();
const st2 = 'es:TEST-DEL-' + Date.now();
await b.from('community_reports').insert({ station_id: st2, type: 'WORKS' });
r = await b.rpc('delete_my_account');
ok(!r.error, `borrar mi cuenta (${r.error?.message ?? 'ok'})`);
r = await anon.from('community_reports').select('station_id').eq('station_id', st2);
ok(!r.error && r.data.length === 0, `sus avisos desaparecen (${r.data?.length ?? r.error?.message})`);
const u = await b.auth.getUser();
ok(!!u.error || !u.data.user, `la sesión deja de ser válida (${u.error?.message ?? 'usuario aún existe'})`);
