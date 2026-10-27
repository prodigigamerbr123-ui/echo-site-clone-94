import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const config = JSON.parse(await readFile(process.env.WORKOUT_STAGE_CONFIG, 'utf8'));
const url = 'http://127.0.0.1:18090';
const clients = [];
const channels = [];
const checks = [];
function client(token) {
  const c = createClient(url, config.anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  clients.push(c); return c;
}
function check(name, condition) { if (!condition) throw new Error(`Staging check failed: ${name}`); checks.push(name); }
const privileged = createClient(url, config.service, { auth: { persistSession: false, autoRefreshToken: false } });
const studentId = randomUUID();
const watchedIds = new Set([studentId]);
const extraStudentIds = [];
const evaluatorId = JSON.parse(Buffer.from(config.users.evaluator.token.split('.')[1], 'base64url').toString()).sub;
let evaluatorRevoked = false;
const bucket = `stage-security-${randomUUID()}`;
let bucketCreated = false;
let studentCreated = false;
try {
  const serviceBucket = await privileged.storage.createBucket(bucket, { public: false });
  check('private_bucket_create', !serviceBucket.error); bucketCreated = true;
  const upload = await privileged.storage.from(bucket).upload('check.txt', Buffer.from('Workout isolated staging storage check'), { contentType: 'text/plain' });
  check('service_upload', !upload.error);
  const downloaded = await privileged.storage.from(bucket).download('check.txt');
  check('service_download', !downloaded.error && (await downloaded.data.text()) === 'Workout isolated staging storage check');
  for (const user of ['admin', 'stranger']) {
    const c = client(config.users[user].token);
    const denied = await c.storage.from(bucket).download('check.txt');
    check(`private_download_denied_${user}`, !!denied.error);
  }
  const admin = client(config.users.admin.token);
  const evaluator = client(config.users.evaluator.token);
  const stranger = client(config.users.stranger.token);
  const received = { admin: false, evaluator: false, stranger: false };
  const databaseReady = { admin: false, evaluator: false, stranger: false };
  const joins = [];
  for (const [user, c] of [['admin', admin], ['evaluator', evaluator], ['stranger', stranger]]) {
    await c.realtime.setAuth(config.users[user].token);
    const channel = c.channel(`stage-${user}-${randomUUID()}`).on('system', {}, event => {
      if (event.status === 'ok' && event.extension === 'postgres_changes') databaseReady[user] = true;
      if (event.status === 'error') console.log('Realtime system error:', user, String(event.message).replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted JWT]'));
    }).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'students' }, event => {
      if (watchedIds.has(event.new?.id)) received[user] = true;
    });
    channels.push([c, channel]);
    joins.push(new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Realtime subscription timeout: ${user}`)), 20000);
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error(`Realtime subscription failed: ${user}`)); }
      });
    }));
  }
  await Promise.all(joins); check('realtime_channels_subscribed', true);
  const readinessDeadline = Date.now()+20000;
  while (Object.values(databaseReady).some(ready => !ready) && Date.now() < readinessDeadline) await new Promise(r => setTimeout(r,100));
  check('postgres_changes_subscriptions_ready', Object.values(databaseReady).every(Boolean));
  const insert = await privileged.from('students').insert({ id: studentId, name: 'Fixture Realtime staging', phone: `439${Math.floor(Math.random()*1e8).toString().padStart(8,'0')}` });
  check('fixture_student_insert', !insert.error); studentCreated = true;
  const deadline = Date.now()+12000;
  while ((!received.admin || !received.evaluator) && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
  check('admin_receives_event', received.admin);
  check('evaluator_receives_event', received.evaluator);
  await new Promise(r => setTimeout(r, 2000));
  check('unassigned_login_does_not_receive_event', !received.stranger);
  const revoke = await privileged.from('staff_members').update({ active: false }).eq('user_id', evaluatorId);
  check('revoke_evaluator_fixture', !revoke.error); evaluatorRevoked = true;
  watchedIds.delete(studentId);
  const secondId = randomUUID(); watchedIds.add(secondId);
  received.admin = false; received.evaluator = false; received.stranger = false;
  const secondInsert = await privileged.from('students').insert({ id: secondId, name: 'Fixture after revocation', phone: `439${Math.floor(Math.random()*1e8).toString().padStart(8,'0')}` });
  check('post_revocation_fixture_insert', !secondInsert.error); extraStudentIds.push(secondId);
  const revokedDeadline = Date.now()+12000;
  while (!received.admin && Date.now() < revokedDeadline) await new Promise(r => setTimeout(r,100));
  check('admin_receives_after_revocation', received.admin);
  await new Promise(r => setTimeout(r,2000));
  check('revoked_evaluator_does_not_receive_event', !received.evaluator);
  const result = { checks_passed: checks.length, realtime: 'real', storage: 'real', destination: 'loopback staging', external_sends: 0 };
  await writeFile('docs/auditoria-2026-10-11/validacao-realtime-storage.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  for (const [c, channel] of channels) await c.removeChannel(channel);
  for (const c of clients) await c.removeAllChannels();
  if (evaluatorRevoked) await privileged.from('staff_members').update({ active: true }).eq('user_id', evaluatorId);
  for (const id of extraStudentIds) await privileged.from('students').delete().eq('id', id);
  if (studentCreated) await privileged.from('students').delete().eq('id', studentId);
  if (bucketCreated) { await privileged.storage.from(bucket).remove(['check.txt']); await privileged.storage.deleteBucket(bucket); }
}
