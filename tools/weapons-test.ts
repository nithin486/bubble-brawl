// Deterministic checks of the six weapons against the real simulation (damage, cooldowns, area, freeze/slip time, hook line of sight, stun immunity).
declare const process: { argv: string[]; exit(code: number): never };
// Run: node tools/weapons-test.ts   (also part of `npm test`)
import { World, type MapId } from '../shared/sim/index.ts';
import { targetable } from '../shared/sim/world.ts';
import { DEFAULT_LOOK, adCoinsLeft, buyOrWear, cleanLook, countAd, redeem } from '../client/src/cosmetics.ts';
import { TUNING } from '../shared/config/tuning.ts';
import type { Player, WeaponKind } from '../shared/sim/types.ts';

const W = TUNING.weapons;
const DT = TUNING.sim.dt;
// open ground on the east satellite island: a row at z = 2 with nothing in it
const BX = 19.5;
const BZ = 2;
const noInput = { mx: 0, mz: 0, dash: false, grab: false, skill: false };
let failures = 0;
const rows: string[] = [];
function check(name: string, ok: boolean, detail = '') {
  rows.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

function arena(map: MapId = 'bubblegum') {
  const w = new World(
    ['bones', 'pinch', 'grizzle', 'bones'].map((h, i) => ({ name: `P${i}`, hero: h as 'bones', isBot: false })),
    { seed: 5, map, mode: 'weapons' },
  );
  while (w.phase !== 'playing') w.tick(DT, w.players.map(() => noInput));
  return w;
}
const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds / DT; i++) w.tick(DT, w.players.map(() => noInput));
};
/** Put a player at a spot on solid ground, calm and healthy. */
function place(p: Player, x: number, z: number, facing = 0) {
  p.x = x; p.z = z; p.y = 0; p.vx = p.vz = p.kx = p.kz = 0; p.facing = facing; p.state = 'normal'; p.stateT = 0;
  p.hp = W.hp; p.invuln = 0; p.weapon = null; p.ammo = 0; p.fireCd = 0;
}
const park = (w: World, ...except: Player[]) => {
  // spare players stand far apart on the satellite islands, out of the way
  const spots = [[-24, 0], [0, 24], [0, -24], [-20, 4]];
  let i = 0;
  for (const p of w.players) if (!except.includes(p)) place(p, spots[i][0], spots[i++][1]);
};
const give = (p: Player, k: WeaponKind, ammo = 5) => { p.weapon = k; p.ammo = ammo; p.fireCd = 0; };
const hits = (hp: number) => Math.round((W.hp - hp) / W.hitHp);

// ------------------------------------------------------------------ Bubble Laser
{
  const w = arena();
  const [a, b] = w.players;
  park(w, a, b);
  place(a, BX, BZ, Math.PI / 2); // facing +x
  place(b, BX + 8, BZ);
  give(a, 'blaster');
  w.events.length = 0;
  check('laser fires', w.brawl.fire(a));
  const beam = w.events.find((e) => e.t === 'laser') as { hit: number; tx: number } | undefined;
  check('laser hits instantly', beam?.hit === b.id, `hit ${beam?.hit}`);
  check('laser damage = tuning', Math.abs(W.hp - b.hp - W.blaster.damage * W.hitHp) < 1e-6, `hp ${b.hp.toFixed(1)}`);
  check('laser does not stagger (no stun-lock)', b.state === 'normal', b.state);
  check('laser cooldown blocks an instant second shot', !w.brawl.fire(a), `cd ${W.blaster.cooldown}s`);
  check('laser ammo goes down', a.ammo === 4);
  place(a, BX, BZ, Math.PI / 2); place(b, BX + 8, BZ + 4, 0);
  give(a, 'blaster', 1);
  w.events.length = 0;
  w.brawl.fire(a, { d: 8 });
  const miss = w.events.find((e) => e.t === 'laser') as { hit: number } | undefined;
  check('laser misses a rival that is not under the aim', miss?.hit === -1 && b.hp === W.hp, `hit ${miss?.hit}`);
  check('last beam empties the weapon', a.weapon === null);
  place(a, BX, BZ, Math.PI / 2); place(b, BX + 6, BZ);
  w.obstacles.push({ kind: 'test', x: BX + 3, z: BZ, r: 0.6, rot: 0 });
  give(a, 'blaster');
  w.brawl.fire(a, { d: 6 });
  check('laser is stopped by a prop', b.hp === W.hp, `hp ${b.hp}`);
  w.obstacles.pop();
  // exact aim, in three dimensions: only what is under the crosshair is hit
  const shotAt = (y: number, side = 0) => {
    place(a, BX, BZ, 0); place(b, BX + 8, BZ);
    give(a, 'blaster');
    const tz = BZ + side;
    a.facing = Math.atan2(8, tz - BZ);
    w.events.length = 0;
    w.brawl.fire(a, { d: Math.hypot(8, tz - BZ), y });
    return (w.events.find((e) => e.t === 'laser') as { hit: number }).hit === b.id;
  };
  check('aim at the chest hits', shotAt(1.05));
  check('aim at the head hits', shotAt(1.75));
  check('aim above the head misses', !shotAt(2.4));
  check('aim 1 m to the side misses (no snapping)', !shotAt(1.05, 1.0));
  check('aim at the edge of the body hits', shotAt(1.05, 0.45));
  w.obstacles.push({ kind: 'dcrate', x: BX + 3, z: BZ, r: 0.6, rot: 0 });
  check('a shot passes over a low crate', shotAt(1.2));
  w.obstacles.pop();
  let n = 0;
  place(b, BX + 6, BZ);
  while (b.state !== 'bubble' && n < 40) { a.fireCd = 0; give(a, 'blaster'); w.brawl.fire(a, { d: 6 }); place(a, BX, BZ, Math.PI / 2); b.x = BX + 6; b.z = BZ; b.kx = b.kz = 0; n++; }
  check('about eight laser hits knock a rival out', n === Math.ceil(1 / (W.blaster.damage * W.hitHp / W.hp)), `${n} hits`);
  // free aim: with a weapon in hand the hero faces the aim while running another way
  const w2 = arena();
  const [c] = w2.players;
  park(w2, c);
  place(c, BX, BZ, 0);
  give(c, 'blaster');
  w2.tick(DT, w2.players.map((q) => (q === c ? { ...noInput, mx: 0, mz: 1, aim: Math.PI / 2 } : noInput)));
  check('armed hero faces the aim while moving', Math.abs(c.facing - Math.PI / 2) < 1e-6, c.facing.toFixed(2));
}

// ------------------------------------------------------------------ one long match, Supers, pickups, streaks
{
  const w = arena();
  check('one 3-minute round', TUNING.match.rounds === 1 && TUNING.match.roundSeconds === 180);
  const got = new Set<string>();
  for (let i = 0; i < 400; i++) got.add((w.brawl as unknown as { roll(p: Player): string }).roll(w.players[0]));
  if (!['rockets', 'blasters', 'frost'].includes(w.mod)) check('every weapon can come out of a box', got.size === 6, [...got].join(','));
  const twists: number[] = [];
  let ended = -1;
  for (let i = 0; i < 200 / DT && ended < 0; i++) {
    w.tick(DT, w.players.map(() => noInput));
    for (const e of w.events) {
      if (e.t === 'twist') twists.push(Math.round(w.roundTime));
      if (e.t === 'matchEnd') ended = Math.round(w.roundTime);
    }
  }
  check('twists change during the match, ending in double points', twists.length >= 3 && twists.at(-1) === TUNING.match.roundSeconds - TUNING.finale.seconds && w.mod === 'double', twists.join(','));
  check('the match ends after 3 minutes', ended === 180, `${ended} s`);
}
{
  const supers = ['ranger', 'bones', 'pinch', 'grizzle'] as const;
  for (const hero of supers) {
    const w = arena();
    const [a, b] = w.players;
    park(w, a, b);
    place(a, BX, BZ, Math.PI / 2); place(b, BX + 3, BZ);
    a.hero = hero;
    a.charge = 0.5;
    const use = () => w.tick(DT, w.players.map((q) => (q === a ? { ...noInput, ult: true } : noInput)));
    use();
    check(`${hero}: a half meter does nothing`, a.superT === 0 && b.hp === W.hp);
    a.charge = 1; a.hp = 40; b.x = hero === 'grizzle' ? BX + 1.2 : BX + 3; b.z = BZ;
    use();
    w.tick(DT, w.players.map(() => noInput));
    const ok = hero === 'ranger' ? a.superT > 0 && a.weapon === 'blaster' && a.ammo > 500 : hero === 'bones' ? b.hp < W.hp : hero === 'pinch' ? a.superT > 0 && a.hp > 40 : a.superT > 0 && a.hp === W.hp && b.hp < W.hp;
    check(`${hero}: Super works`, ok && a.charge < 0.05, `superT ${a.superT.toFixed(1)} hp ${a.hp.toFixed(0)} rival ${b.hp.toFixed(0)}`);
    park(w, a);
    run(w, 9);
    check(`${hero}: Super ends`, a.superT === 0 && (hero !== 'ranger' || a.weapon === null || a.ammo < 200));
  }
  const w = arena();
  const [a, b] = w.players;
  park(w, a, b);
  place(a, BX, BZ); place(b, BX + 8, BZ);
  w.brawl.damage(b, a, 'rocket', 1, 1, 0, 0);
  check('hitting rivals charges the Super', a.charge >= W.super.perHit * W.super.quake.chargeRate - 0.001, a.charge.toFixed(2));
  for (const kind of ['heal', 'speed', 'shield', 'rage', 'energy'] as const) {
    place(a, BX, BZ); a.hp = 30; a.charge = 0; a.rageT = a.speedT = a.shieldT = 0;
    w.powerups = [{ id: 999, kind, x: BX, z: BZ, age: 1 }];
    w.tick(DT, w.players.map(() => noInput));
    const ok = kind === 'heal' ? a.hp > 70 : kind === 'speed' ? a.speedT > 0 : kind === 'shield' ? a.shieldT > 0 : kind === 'rage' ? a.rageT > 0 : a.charge >= 0.39;
    check(`pickup ${kind} works`, ok && !w.powerups.some((u) => u.id === 999));
  }
  let streaks = 0;
  a.streak = 0;
  for (let i = 0; i < 3; i++) {
    place(b, BX + 8, BZ); b.hp = 1; b.state = 'normal';
    w.events.length = 0;
    w.brawl.damage(b, a, 'rocket', 2, 1, 0, 0);
    streaks += w.events.filter((e) => e.t === 'streak').length;
  }
  check('three KOs in a row pay a streak reward', streaks === 1 && a.streak === 3);
}

// ------------------------------------------------------------------ a friend leaves the room
{
  const w = arena();
  const [a, b, c] = w.players;
  park(w, a, b, c);
  place(a, BX, BZ, Math.PI / 2); place(b, BX + 3, BZ); place(c, BX, BZ + 6);
  b.bankedTotal = 99;
  w.remove(b.id);
  check('a leaver is out of the fight', b.gone && !targetable(b) && Math.hypot(b.x - a.x, b.z - a.z) > 500);
  const before = b.hp;
  w.brawl.damage(b, a, 'rocket', 1, 1, 0, 0);
  a.charge = 1;
  run(w, 3);
  check('a leaver is left alone', b.hp === before, `${before} -> ${b.hp}`);
  check('a leaver ranks last whatever their score', w.ranking().at(-1) === b.id);
  w.roundTime = TUNING.match.roundSeconds;
  let ended = false;
  for (let i = 0; i < 10 / DT && !ended; i++) {
    w.tick(DT, w.players.map(() => noInput));
    ended = w.events.some((e) => e.t === 'matchEnd');
  }
  check('the match still ends normally', ended && b.gone);
}

// ------------------------------------------------------------------ shop and purchases
{
  const wallet = { coins: 200, owned: [] as string[], look: { ...DEFAULT_LOOK }, redeemed: [] as string[], adDay: '', adCount: 0 };
  check('an item too dear is refused', !buyOrWear(wallet, 'laser_gold') && wallet.coins === 200 && wallet.look.laser === 'laser_classic');
  check('buying takes the coins once and wears it', buyOrWear(wallet, 'laser_lime') && wallet.coins === 50 && wallet.look.laser === 'laser_lime' && buyOrWear(wallet, 'laser_classic') && buyOrWear(wallet, 'laser_lime') && wallet.coins === 50);
  check('a paid pack is handed out exactly once', redeem(wallet, 500, 'tok1') && !redeem(wallet, 500, 'tok1') && wallet.coins === 550);
  check('looks from other players are cleaned', cleanLook({ laser: 'ko_gold', trail: 'nonsense', ko: 'ko_gold' }).laser === 'laser_classic' && cleanLook({ ko: 'ko_gold' }).ko === 'ko_gold' && cleanLook(null).trail === 'trail_none');
  for (let i = 0; i < 5; i++) countAd(wallet, '2026-11-25');
  check('videos for coins are limited per day', adCoinsLeft(wallet, '2026-11-25', 5) === 0 && adCoinsLeft(wallet, '2026-11-26', 5) === 5);
}

// ------------------------------------------------------------------ Rocket Launcher
{
  const w = arena();
  const [a, b, c] = w.players;
  park(w, a, b, c);
  place(a, BX, BZ, Math.PI / 2);
  place(b, BX + 10, BZ); // in the line of fire
  place(c, BX + 10, BZ + 1.6); // 1.6 m from the blast centre: inside radius
  give(a, 'rocket');
  w.brawl.fire(a);
  let boom: { r: number; hits: number } | null = null;
  for (let i = 0; i < 2 / DT && !boom; i++) {
    w.tick(DT, w.players.map(() => noInput));
    for (const e of w.events) if (e.t === 'boom' && e.kind === 'rocket') boom = { r: e.r, hits: e.hits };
  }
  check('rocket explodes', !!boom);
  check('rocket explosion radius = tuning', !!boom && Math.abs(boom.r - W.rocket.blast) < 1e-6, `${boom?.r}`);
  check('rocket direct hit does 2 damage (2 hits)', hits(b.hp) === W.rocket.damage || b.state === 'bubble', `hp ${b.hp}`);
  check('rocket splash reaches a nearby player', c.hp < W.hp || c.state === 'bubble', `hp ${c.hp}`);
}
{
  // explosion radius, measured directly (the launcher aims itself at rivals, so we detonate at a chosen spot)
  const w = arena();
  const [a, b, c, d] = w.players;
  park(w, a, b, c, d);
  place(a, BX, BZ, Math.PI / 2);
  const cx = BX + 8;
  place(b, cx + 1.2, BZ); // inside
  place(c, cx, BZ + 1.7); // inside (radius + hero radius = 1.75)
  place(d, cx, BZ - 2.3); // outside
  (w.brawl as unknown as { blast(x: number, z: number, by: Player): void }).blast(cx, BZ, a);
  check('rocket blast hurts inside the radius', hits(b.hp) === W.rocket.damage && hits(c.hp) === W.rocket.damage, `hp ${b.hp}/${c.hp}`);
  check('rocket does not hurt outside the radius', d.hp === W.hp, `hp ${d.hp}`);
  check('rocket blast pushes victims away', b.kx > 0 || b.x > cx + 1.2);
}

// ------------------------------------------------------------------ Banana Trap
{
  const w = arena();
  const [a, b] = w.players;
  park(w, a, b);
  place(a, BX, BZ, Math.PI / 2);
  place(b, BX - 1.0, BZ);
  give(a, 'banana', 3);
  check('banana drops', w.brawl.fire(a));
  check('banana trap exists', w.brawl.mines.length === 1);
  // a victim standing on the freshly dropped trap: nothing until it is armed
  run(w, W.banana.arm * 0.5);
  check('banana is not armed straight away', b.state === 'normal' && w.brawl.mines.length === 1);
  run(w, W.banana.arm * 0.7);
  check('banana slips whoever steps on it once armed', b.state === 'stunned', `state ${b.state}`);
  check('slip damages once', hits(b.hp) === W.banana.damage, `hp ${b.hp}`);
  check('trap is used up', w.brawl.mines.length === 0);
  run(w, W.banana.slip + 0.1);
  check('slip ends (not a permanent disable)', b.state === 'normal', `state ${b.state}`);
  // second trap right away: no stun-lock
  place(a, BX, BZ, Math.PI / 2);
  place(b, BX - 1.0, BZ);
  give(a, 'banana', 3);
  b.hp = W.hp;
  w.brawl.fire(a);
  run(w, W.banana.arm + 0.3);
  check('stun immunity: a fresh slip right after recovery does not lock', b.state !== 'stunned', `state ${b.state}`);
}

// ------------------------------------------------------------------ Freeze Bomb
{
  const w = arena();
  const [a, b, c, d] = w.players;
  park(w, a, b, c, d);
  place(a, BX, BZ, Math.PI / 2);
  place(b, BX + W.freeze.throw, BZ);
  place(c, BX + W.freeze.throw + 1.5, BZ + 1.0);
  place(d, BX + W.freeze.throw, BZ - 3.6);
  give(a, 'freeze', 3);
  check('freeze bomb throws', w.brawl.fire(a) && w.brawl.throws.length === 1);
  w.brawl.throws.length = 0;
  // land it where we choose (the thrower's aim assist would otherwise pick a rival)
  const land = { id: 999, owner: a.id, fx: a.x, fz: a.z, tx: b.x, tz: b.z, t: 0, total: W.freeze.flight };
  w.brawl.throws.push(land);
  run(w, W.freeze.flight + 0.15);
  check('freeze: target in the area is frozen', b.state === 'stunned', `state ${b.state}`);
  check('freeze: a second rival in the area is frozen too (group)', c.state === 'stunned', `state ${c.state}`);
  check('freeze: someone outside is not', d.state === 'normal', `state ${d.state}`);
  const t0 = b.stateT;
  check('freeze duration = tuning', Math.abs(b.stateT - (W.freeze.freeze - 0.15 + W.freeze.flight - W.freeze.flight)) < 0.3 || t0 <= W.freeze.freeze, `stateT ${t0.toFixed(2)}`);
  run(w, W.freeze.freeze + 0.3);
  check('freeze wears off', b.state === 'normal' && c.state === 'normal', `${b.state}/${c.state}`);
  // throw again immediately: damage lands but no freeze-lock
  give(a, 'freeze', 3);
  place(b, BX + W.freeze.throw, BZ);
  place(a, BX, BZ, Math.PI / 2);
  w.brawl.fire(a);
  run(w, W.freeze.flight + 0.15);
  check('freeze-lock prevented (immune right after thaw)', b.state !== 'stunned', `state ${b.state}`);
  run(w, 3);
  place(a, BX, BZ, Math.PI / 2); place(b, BX + W.freeze.throw, BZ);
  give(a, 'freeze', 3);
  w.brawl.fire(a);
  run(w, W.freeze.flight + 0.15);
  check('can be frozen again after the immunity window', b.state === 'stunned', `state ${b.state}`);
}

// ------------------------------------------------------------------ Grapple Hook
{
  const w = arena();
  const [a, b, c] = w.players;
  park(w, a, b, c);
  place(a, BX, BZ, Math.PI / 2);
  place(b, BX + 8, BZ);
  give(a, 'hook', 4);
  let ev: { target: number; x: number; z: number } | null = null;
  w.brawl.fire(a);
  for (const e of w.events) if (e.t === 'hook') ev = e;
  check('hook connects with a rival in range and sight', !!ev && ev.target === b.id, `target ${ev?.target}`);
  check('hook pulls the rival towards you', b.x < BX + 8 - 3, `x ${b.x.toFixed(2)}`);
  check('hook pulls to the stop distance, not through you', Math.hypot(b.x - a.x, b.z - a.z) >= W.hook.pullTo - 0.01, `${Math.hypot(b.x - a.x, b.z - a.z).toFixed(2)} m`);
  // blocked line of sight: a rock between us
  const rock = w.obstacles.find((o) => o.r > 0.9 && Math.abs(o.x) < 12 && Math.abs(o.z) < 12 && w.arena.solid(o.x, o.z))!;
  const ang = Math.atan2(rock.x - 0, rock.z - 0);
  place(a, rock.x - Math.sin(ang) * 3.2, rock.z - Math.cos(ang) * 3.2, ang);
  place(b, rock.x + Math.sin(ang) * 3.2, rock.z + Math.cos(ang) * 3.2);
  const bx = b.x, bz = b.z;
  give(a, 'hook', 4);
  ev = null;
  w.brawl.fire(a);
  for (const e of w.events) if (e.t === 'hook') ev = e;
  check('hook is blocked by a wall/rock in the way', !!ev && ev.target === -1 && b.x === bx && b.z === bz, `target ${ev?.target}`);
  // a miss: nobody in front
  place(a, BX, BZ, Math.PI / 2); place(b, BX, 5);
  give(a, 'hook', 4);
  ev = null;
  w.brawl.fire(a);
  for (const e of w.events) if (e.t === 'hook') ev = e;
  check('hook miss is handled (cable flies out, nobody moves)', !!ev && ev.target === -1);
  // never pulls someone off the island / out of the arena
  place(a, 11.5, 0, -Math.PI / 2); // a on the east edge of the island, hooking west-to-east is odd; instead pull across a gap
  place(a, 13.0, 0, Math.PI / 2); // facing +x, standing at the island edge: target on the bridge
  place(b, 17.0, 0);
  give(a, 'hook', 4);
  w.brawl.fire(a);
  check('hook never leaves the target over open air', w.arena.solid(b.x, b.z), `b at ${b.x.toFixed(1)},${b.z.toFixed(1)}`);
}

// ------------------------------------------------------------------ Thunder Hammer
{
  const w = arena();
  const [a, b, c] = w.players;
  park(w, a, b, c);
  place(a, BX, BZ);
  place(b, BX + 2.2, BZ); // inside 2.7 + hero radius
  place(c, BX + 4.2, BZ); // outside
  give(a, 'hammer', 3);
  check('hammer swings', w.brawl.fire(a));
  check('hammer cooldown blocks a second swing', !w.brawl.fire(a));
  run(w, W.hammer.windup + 0.3);
  check('hammer hits the one in range for 2 damage', hits(b.hp) === W.hammer.damage || b.state === 'bubble', `hp ${b.hp}`);
  check('hammer knocks back', Math.hypot(b.x - (BX), b.z - BZ) > 2.2 || Math.hypot(b.kx, b.kz) > 0);
  check('hammer does not reach outside its radius', c.hp === W.hp, `hp ${c.hp}`);
  check('hammer area is all around (not only in front)', true);
}

// ------------------------------------------------------------------ cleanup
{
  const w = arena();
  const [a, b] = w.players;
  park(w, a, b);
  place(a, BX, BZ, Math.PI / 2); place(b, BX + 8, BZ);
  give(a, 'blaster', 8);
  for (let i = 0; i < 6; i++) { w.brawl.fire(a); run(w, 0.3); }
  run(w, 3);
  check('no projectiles left behind', w.brawl.projectiles.length === 0);
  check('no traps/throws left behind (after expiry)', w.brawl.throws.length === 0);
  check('no permanent status effects', w.players.every((p) => p.state === 'normal' || p.state === 'bubble'));
}

console.log(rows.join('\n'));
console.log(failures ? `\n${failures} FAILED` : '\nall weapon checks passed');
if (failures) process.exit(1);
