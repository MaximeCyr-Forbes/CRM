import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { getSupabaseServiceClient } from '../supabase/server';
import { centrisClient, CentrisError, isConfigured, odataString } from './client';
import { discoverMembers, mapProperty, safeMediaUrl, type Member, type MemberMapping, type Property, type MappedProperty } from './mapping';
import type { ListingBroker } from '../../data/listing-types';
import { DETAIL_FIELDS } from './details';

export type CentrisSyncActor =
  | { memberId: string; broker: ListingBroker | null; source: 'manual' }
  | { memberId: null; broker: null; source: 'cron' };

const BUCKET = 'centris-listing-images';
const SELECT = 'ListingKey,ListingId,ListAgentKey,CoListAgentKey,StreetNumberStart,StreetShortName,StreetName,UnitNumber,Township,CityOrTownshipKey,StateOrProvince,PostalCode,Country,ListPrice,RentPrice,StandardStatus,MlsStatus,PropertyType,PropertySubType,ListingTerms,ListingURL,OnMarketTimestamp,ModificationTimestamp';
type Action = 'created' | 'updated' | 'unchanged' | 'skipped' | 'conflict';
export type SyncResult = { fetched: number; eligible: number; created: number; updated: number; unchanged: number;
  skipped: number; conflicts: number; errors: number; warnings: string[]; dryRun: boolean; changes?: number;
  preview: { address: string; broker: string; price: number | null; purpose: string; action: string }[] };
const emptyResult = (dryRun: boolean): SyncResult => ({ fetched: 0, eligible: 0, created: 0, updated: 0,
  unchanged: 0, skipped: 0, conflicts: 0, errors: 0, changes: 0, warnings: [], dryRun, preview: [] });
const publicResult = (r: SyncResult) => ({ ...r, preview: undefined });
function check(error: unknown) { if (error) throw new CentrisError('unavailable'); }
function mediaPath(mapped: MappedProperty) {
  return `${createHash('sha256').update(mapped.source.key).digest('hex')}/${createHash('sha256').update(mapped.source.mediaKey ?? '').digest('hex')}.jpg`;
}
async function memberMappings(signal: AbortSignal) {
  const db = getSupabaseServiceClient();
  const saved = await db.from('centris_member_mappings').select('*'); check(saved.error);
  if (saved.data?.length === 3) return { mappings: saved.data as MemberMapping[], warnings: [] };
  const members = await db.from('crm_members').select('id,broker').eq('active', true); check(members.error);
  const identities = await db.from('crm_member_auth_identities').select('member_id,email_normalized').eq('active', true); check(identities.error);
  const known = (identities.data ?? []).flatMap(i => {
    const member = members.data?.find(m => m.id === i.member_id);
    return member ? [{ broker: member.broker as ListingBroker, email: i.email_normalized as string }] : [];
  });
  // MemberEmail is NOT indexed by Centris. One bounded, paginated discovery, persisted only on a real run.
  const source = await centrisClient.collection<Member>('Member', {
    $select: 'MemberKey,MemberMlsId,MemberEmail,MemberFullName,MemberStatus', $top: '1000',
  }, signal);
  return discoverMembers(source, known);
}
async function storeImage(mapped: MappedProperty, signal: AbortSignal) {
  if (!mapped.image) return;
  const url = safeMediaUrl(mapped.image.MediaURL); if (!url) throw new CentrisError('invalid');
  const db = getSupabaseServiceClient(); const path = mediaPath(mapped);
  // No credentials are ever sent to the media server. No redirect to arbitrary hosts.
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
  const type = response.headers.get('content-type')?.split(';')[0];
  if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type ?? '')
    || Number(response.headers.get('content-length') ?? 0) > 8_000_000 || !response.body) throw new CentrisError('unavailable');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
    if (size > 8_000_000) { await reader.cancel(); throw new CentrisError('invalid'); } chunks.push(part.value); }
  const uploaded = await db.storage.from(BUCKET).upload(path, Buffer.concat(chunks), { contentType: type!, cacheControl: '31536000', upsert: false });
  if (uploaded.error && !/already exists|duplicate/i.test(uploaded.error.message)) throw new CentrisError('unavailable');
}
export async function centrisStatus() {
  if (!isConfigured()) return { configured: false, connected: false };
  const { data, error } = await getSupabaseServiceClient().from('centris_sync_state').select('*').eq('id', true).single(); check(error);
  const [runs, schedule] = await Promise.all([
    getSupabaseServiceClient().from('centris_sync_runs').select('started_at,completed_at,status,result,trigger_source').order('started_at', { ascending: false }).limit(10),
    getSupabaseServiceClient().rpc('centris_schedule_status'),
  ]);
  return { configured: true, connected: Boolean(data.last_success_at) && !['failed','partial'].includes(data.status), status: data.status,
    automatic: !schedule.error && schedule.data === true,
    history: runs.error ? [] : (runs.data ?? []).map(run => ({ startedAt: run.started_at, completedAt: run.completed_at,
      status: run.status, source: run.trigger_source, created: run.result?.created ?? 0, updated: run.result?.updated ?? 0,
      unchanged: run.result?.unchanged ?? 0, errors: run.result?.errors ?? 0, changes: run.result?.changes ?? 0 })),
    running: data.status === 'running' && Date.parse(data.lock_until ?? '') > Date.now(),
    lastSuccessAt: data.last_success_at, lastRunAt: data.last_completed_at, lastResult: data.result, error: data.last_error };
}
export async function syncCentris(actor: CentrisSyncActor, dryRun = true): Promise<SyncResult> {
  if (!isConfigured()) throw new CentrisError('configuration');
  const db = getSupabaseServiceClient(), runId = randomUUID(), started = Date.now();
  const signal = AbortSignal.timeout(240000); const result = emptyResult(dryRun);
  let locked = false;
  try {
    if (!dryRun) {
      const lock = await db.rpc('centris_start_sync', { p_run: runId, p_actor: actor.memberId }); check(lock.error);
      if (!lock.data) throw new CentrisError('busy'); locked = true;
      console.info('centris_sync_started', { runId, actor: actor.memberId, source: actor.source });
    }
    const discovery = await memberMappings(signal); result.warnings.push(...discovery.warnings);
    if (!discovery.mappings.length) throw new CentrisError('invalid');
    const keys = discovery.mappings.map(m => odataString(m.member_key)).join(',');
    const properties = await centrisClient.collection<Property>('Property', {
      $select: `${SELECT},${DETAIL_FIELDS}`, $expand: 'Media', $filter: `ListAgentKey in (${keys}) or CoListAgentKey in (${keys})`,
    }, signal);
    if (properties.length > 500 || new Set(properties.map(p => p.ListingKey)).size !== properties.length) throw new CentrisError('invalid');
    result.fetched = properties.length;
    const cities = new Map<string, string>();
    const cityKeys = [...new Set(properties.filter(p => !p.Township && p.CityOrTownshipKey).map(p => String(p.CityOrTownshipKey)))];
    if (cityKeys.length) {
      const rows = await centrisClient.collection<{ CityOrTownshipKey: string; CityOrTownshipName: string }>('CityOrTownship', {
        $select: 'CityOrTownshipKey,CityOrTownshipName', $filter: `CityOrTownshipKey in (${cityKeys.map(odataString).join(',')})`,
      }, signal); rows.forEach(c => cities.set(c.CityOrTownshipKey, c.CityOrTownshipName));
    }
    const planned: { mapped: MappedProperty; action: Action; changes: number }[] = [];
    for (const property of properties) {
      let mapped: MappedProperty;
      try { mapped = mapProperty(property, discovery.mappings, cities); }
      catch { result.skipped++; result.warnings.push(`Inscription ${String(property.ListingId ?? '').replace(/[^0-9]/g, '').slice(0,20)} : données à vérifier.`); continue; }
      if (mapped.eligible) result.eligible++;
      if (mapped.warning) result.warnings.push(mapped.warning);
      if (mapped.image) mapped.values.primaryImageUrl = db.storage.from(BUCKET).getPublicUrl(mediaPath(mapped)).data.publicUrl;
      const plan = await db.rpc('centris_apply_property', { p_values: mapped.values, p_source: mapped.source,
        p_eligible: mapped.eligible, p_actor: actor.broker, p_dry_run: true }); check(plan.error);
      planned.push({ mapped, action: plan.data.action, changes: plan.data.changes ?? 0 });
      result.preview.push({ address: `${mapped.values.civicNumber} ${mapped.values.address}, ${mapped.values.city}`,
        broker: String(mapped.values.broker), price: mapped.values.purpose === 'sale' ? mapped.values.askingPrice ?? null : mapped.values.monthlyRent ?? null,
        purpose: mapped.values.purpose!, action: plan.data.action });
    }
    if (properties.length && !planned.length) throw new CentrisError('invalid');
    if (planned.length && planned.every(p => p.mapped.values.propertyType === 'other')) throw new CentrisError('invalid');
    const conflicts = planned.filter(p => p.action === 'conflict').length;
    // Never partially bootstrap on an identity conflict. The dry run explains the conflict.
    if (!dryRun && conflicts) throw new CentrisError('invalid');
    if (!dryRun) {
      const saved = await db.from('centris_member_mappings').upsert(discovery.mappings.map(m => ({ ...m, verified_at: new Date().toISOString() })), { onConflict: 'broker' }); check(saved.error);
      if (planned.some(p => p.mapped.image && ['created','updated'].includes(p.action))) {
        const bucket = await db.storage.getBucket(BUCKET);
        if (bucket.error) {
          const created = await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 8_000_000, allowedMimeTypes: ['image/jpeg','image/png','image/webp'] }); check(created.error);
        }
      }
    }
    for (const plan of planned) {
      let action = plan.action;
      let changes = plan.changes;
      if (!dryRun && ['created','updated'].includes(action)) {
        try {
          signal.throwIfAborted();
          if (plan.mapped.image) {
            const existing = await db.from('listings').select('centris_media_key').eq('centris_listing_key',plan.mapped.source.key).maybeSingle(); check(existing.error);
            if (existing.data?.centris_media_key !== plan.mapped.source.mediaKey) await storeImage(plan.mapped,signal);
          }
          const applied = await db.rpc('centris_apply_property', { p_values: plan.mapped.values, p_source: plan.mapped.source,
            p_eligible: plan.mapped.eligible, p_actor: actor.broker, p_dry_run: false, p_run: runId }); check(applied.error);
          action = applied.data.action;
          changes = applied.data.changes ?? 0;
        } catch { result.errors++; result.warnings.push(`Inscription ${plan.mapped.values.centrisNumber} : synchronisation à réessayer.`); continue; }
      }
      if (action === 'conflict') result.conflicts++; else result[action]++;
      result.changes = (result.changes ?? 0) + changes;
    }
    if (locked) {
      const finished = await db.rpc('centris_finish_sync', { p_run: runId,
        p_status: result.errors || result.warnings.length ? 'partial' : 'success', p_result: publicResult(result) }); check(finished.error);
      console.info('centris_sync_completed', { runId, actor: actor.memberId, source: actor.source, duration: Date.now() - started,
        fetched: result.fetched, created: result.created, updated: result.updated, unchanged: result.unchanged, skipped: result.skipped, conflicts: result.conflicts });
    }
    return result;
  } catch (error) {
    const safe = error instanceof CentrisError ? error : new CentrisError('unavailable');
    if (locked) {
      await db.rpc('centris_finish_sync', { p_run: runId, p_status: 'failed', p_result: publicResult(result), p_error: safe.message });
      console.warn('centris_sync_failed', { runId, actor: actor.memberId, source: actor.source, duration: Date.now() - started, code: safe.code });
    }
    throw safe;
  }
}
