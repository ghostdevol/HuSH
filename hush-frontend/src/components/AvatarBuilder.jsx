import React from 'react';
import { BuilderSvg, AVATAR_DEFAULT, AVATAR_KINDS } from './AvatarView';

// Slot choices — must match AVATAR_SLOTS in backend/server.js exactly.
export const AVATAR_SLOTS = {
  skin: ['#ffdfc4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3836'],
  hairStyle: ['bald', 'short', 'spiky', 'mohawk', 'long', 'bun'],
  hairColor: ['#14100d', '#3b2314', '#7a4a21', '#b97a45', '#e3c565', '#c0c0c0', '#c23b22', '#31559f'],
  eyes: ['dots', 'happy', 'wink', 'sleepy', 'star'],
  mouth: ['smile', 'grin', 'flat', 'open', 'smirk'],
  accessory: ['none', 'glasses', 'shades', 'cap', 'headphones']
};

const BG_CHOICES = ['#312e81', '#7f1d1d', '#14532d', '#0c4a6e', '#581c87', '#831843', '#1f2937', '#78350f'];

// Body-color presets per kind — kindColor rides to the server as a
// free-form hex (same treatment as bgColor), so the custom color
// input works for every kind too.
const KIND_COLORS = {
  ghost: ['#e8edf2', '#a7f3d0', '#bae6fd', '#fbcfe8', '#ddd6fe', '#fef08a', '#1f2937'],
  skull: ['#e8e0c8', '#d6cfc0', '#f5f0e6', '#c9b458', '#9db38a', '#8d99ae', '#5c3836'],
  robot: ['#94a3b8', '#64748b', '#b45309', '#b91c1c', '#1d4ed8', '#0f766e', '#e8edf2', '#1f2937'],
  cat: ['#f59e0b', '#78716c', '#1f2937', '#f5f0e6', '#b45309', '#f9a8d4', '#38bdf8', '#312e81'],
  wolf: ['#8d99ae', '#e8edf2', '#57534e', '#1f2937', '#f5f0e6', '#312e81', '#7f1d1d'],
  alien: ['#4ade80', '#22ff88', '#a3e635', '#2dd4bf', '#94a3b8', '#c084fc', '#312e81'],
  dragon: ['#16a34a', '#dc2626', '#7c3aed', '#0ea5e9', '#f59e0b', '#111827', '#db2777'],
  pumpkin: ['#f97316', '#ea580c', '#fb923c', '#16a34a', '#facc15', '#7c2d12']
};
const KIND_BODY_LABEL = {
  ghost: 'Sheet color', skull: 'Bone tone', robot: 'Shell color', cat: 'Fur color',
  wolf: 'Fur color', alien: 'Skin color', dragon: 'Scale color', pumpkin: 'Rind color'
};

// Per-kind names for the shared slots — the hairStyle slot drives each
// kind's top detail, the hairColor slot drives each kind's accent.
const KIND_SLOTS = {
  human: { top: 'Hair style', color: 'Hair color' },
  ghost: {
    top: 'Wisps', color: 'Halo glow',
    names: { bald: 'Smooth', short: 'Tuft', spiky: 'Flames', mohawk: 'Big flame', long: 'Drapes', bun: 'Knot' }
  },
  skull: {
    top: 'Details', color: 'Eye glow',
    names: { bald: 'Clean', short: 'Crack', spiky: 'Cracks', mohawk: 'Mohawk', long: 'Hair', bun: 'Hair + bun' }
  },
  robot: {
    top: 'Antenna', color: 'Lights',
    names: { bald: 'None', short: 'Stub', spiky: 'Triple', mohawk: 'Fin', long: 'Whips', bun: 'Dish' }
  },
  cat: {
    top: 'Ears', color: 'Inner ear',
    names: { bald: 'Folded', short: 'Pointy', spiky: 'Tall', mohawk: 'One flop', long: 'Droopy', bun: 'Round' }
  },
  wolf: {
    top: 'Ears', color: 'Inner ear',
    names: { bald: 'Folded', short: 'Pointy', spiky: 'Tall', mohawk: 'Crest', long: 'Droopy', bun: 'Round' }
  },
  alien: {
    top: 'Antennae', color: 'Orb color',
    names: { bald: 'None', short: 'One orb', spiky: 'Bumps', mohawk: 'Fin', long: 'Pair', bun: 'Ring orb' }
  },
  dragon: {
    top: 'Horns', color: 'Fins',
    names: { bald: 'Nubs', short: 'Curved', spiky: 'Spikes', mohawk: 'Crest', long: 'Swept', bun: 'Spiral' }
  },
  pumpkin: {
    top: 'Stem', color: 'Carve glow',
    names: { bald: 'Stub', short: 'Curl vine', spiky: 'Leaves', mohawk: 'Tall stem', long: 'Vine drape', bun: 'Leaf top' }
  }
};

function SlotRow({ label, children }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold capitalize ${
        active
          ? 'bg-rose-600 text-white shadow-md shadow-rose-950/50 ring-1 ring-rose-300/40'
          : 'border border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function Swatch({ active, onClick, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ backgroundColor: color }}
      className={`h-7 w-7 rounded-lg border-2 ${active ? 'border-white' : 'border-white/15'}`}
      aria-label={color}
    />
  );
}

// Live-preview avatar builder. `spec`/`onChange` are controlled by the
// profile edit form; saving happens there (single PUT /me round-trip).
export default function AvatarBuilder({ spec, onChange }) {
  const s = { ...AVATAR_DEFAULT, ...(spec || {}) };
  const kind = AVATAR_KINDS.some((k) => k.id === s.kind) ? s.kind : 'human';
  const slots = KIND_SLOTS[kind];
  const set = (slot, value) => onChange({ ...s, [slot]: value });
  const pickKind = (id) => {
    const next = { ...s, kind: id };
    if (KIND_COLORS[id] && KIND_COLORS[id].length) next.kindColor = KIND_COLORS[id][0];
    onChange(next);
  };
  const topName = (v) => (slots.names && slots.names[v]) || v;

  return (
    <div className="flex gap-4">
      <div className="h-28 w-28 shrink-0 overflow-hidden rounded-full shadow-xl shadow-black/50 ring-2 ring-white/20">
        <BuilderSvg spec={s} />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <SlotRow label="Kind — pick your creature">
          {AVATAR_KINDS.map((k) => (
            <Chip key={k.id} active={kind === k.id} onClick={() => pickKind(k.id)}>
              {k.icon} {k.label}
            </Chip>
          ))}
        </SlotRow>
        {kind === 'human' ? (
          <SlotRow label="Skin tone">
            {AVATAR_SLOTS.skin.map((c) => (
              <Swatch key={c} color={c} active={s.skin === c} onClick={() => set('skin', c)} />
            ))}
          </SlotRow>
        ) : (
          <SlotRow label={KIND_BODY_LABEL[kind]}>
            {KIND_COLORS[kind].map((c) => (
              <Swatch key={c} color={c} active={s.kindColor === c} onClick={() => set('kindColor', c)} />
            ))}
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(s.kindColor || '') ? s.kindColor : '#e8edf2'}
              onChange={(e) => set('kindColor', e.target.value)}
              className="h-7 w-10 cursor-pointer rounded-lg border border-white/15 bg-slate-900"
              title="Custom body color"
            />
          </SlotRow>
        )}
        <SlotRow label={slots.top}>
          {AVATAR_SLOTS.hairStyle.map((v) => (
            <Chip key={v} active={s.hairStyle === v} onClick={() => set('hairStyle', v)}>{topName(v)}</Chip>
          ))}
        </SlotRow>
        <SlotRow label={slots.color}>
          {AVATAR_SLOTS.hairColor.map((c) => (
            <Swatch key={c} color={c} active={s.hairColor === c} onClick={() => set('hairColor', c)} />
          ))}
        </SlotRow>
        <SlotRow label="Eyes">
          {AVATAR_SLOTS.eyes.map((v) => (
            <Chip key={v} active={s.eyes === v} onClick={() => set('eyes', v)}>{v}</Chip>
          ))}
        </SlotRow>
        <SlotRow label="Mouth">
          {AVATAR_SLOTS.mouth.map((v) => (
            <Chip key={v} active={s.mouth === v} onClick={() => set('mouth', v)}>{v}</Chip>
          ))}
        </SlotRow>
        <SlotRow label="Accessory">
          {AVATAR_SLOTS.accessory.map((v) => (
            <Chip key={v} active={s.accessory === v} onClick={() => set('accessory', v)}>{v}</Chip>
          ))}
        </SlotRow>
        <SlotRow label="Background">
          {BG_CHOICES.map((c) => (
            <Swatch key={c} color={c} active={s.bgColor === c} onClick={() => set('bgColor', c)} />
          ))}
          <input
            type="color"
            value={s.bgColor}
            onChange={(e) => set('bgColor', e.target.value)}
            className="h-7 w-10 cursor-pointer rounded-lg border border-white/15 bg-slate-900"
            title="Custom background color"
          />
        </SlotRow>
      </div>
    </div>
  );
}
