import React from 'react';
import { BuilderSvg, AVATAR_DEFAULT } from './AvatarView';

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
        active ? 'bg-purple-600 text-white' : 'border border-white/10 bg-slate-900 text-slate-300'
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
  const set = (slot, value) => onChange({ ...s, [slot]: value });

  return (
    <div className="flex gap-4">
      <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-white/10">
        <BuilderSvg spec={s} />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <SlotRow label="Skin tone">
          {AVATAR_SLOTS.skin.map((c) => (
            <Swatch key={c} color={c} active={s.skin === c} onClick={() => set('skin', c)} />
          ))}
        </SlotRow>
        <SlotRow label="Hair style">
          {AVATAR_SLOTS.hairStyle.map((v) => (
            <Chip key={v} active={s.hairStyle === v} onClick={() => set('hairStyle', v)}>{v}</Chip>
          ))}
        </SlotRow>
        <SlotRow label="Hair color">
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
