// Which HUD panels are folded away. Clean view (V) folds every optional panel at once; the
// fold buttons on single panels work on their own. The fishing essentials never fold: the
// prompt, cast meter, fight meters, drag and reel speed, fish finder, toasts and notices.

export const HUD_KEY = 'memefishing-hud-v1';

// Panels a player can fold one at a time, and what's left showing when folded.
export const FOLDS = {
  info: 'Clock only',
  wallet: 'Wallet only',
  gear: 'Drag, speed and depth only'
};

export const newHudView = () => ({ version: 1, clean: false, folded: {} });

export function loadHudView(storage) {
  try {
    const data = JSON.parse(storage?.getItem(HUD_KEY) || 'null');
    if (!data || data.version !== 1) return newHudView();
    const folded = {};
    for (const k of Object.keys(FOLDS)) if (data.folded?.[k]) folded[k] = true;
    return { version: 1, clean: !!data.clean, folded };
  } catch {
    return newHudView();
  }
}

export function saveHudView(storage, view) {
  try {
    storage?.setItem(HUD_KEY, JSON.stringify(view));
  } catch {
    // Not worth breaking the game over.
  }
}

export const toggleClean = (view) => ((view.clean = !view.clean), view);

export function toggleFold(view, key) {
  if (!(key in FOLDS)) return view;
  if (view.clean) {
    // Unfolding one panel out of clean view: leave clean view but keep the rest folded.
    view.clean = false;
    for (const k of Object.keys(FOLDS)) view.folded[k] = k !== key;
    return view;
  }
  view.folded[key] = !view.folded[key];
  return view;
}

// CSS classes for the HUD root.
export function hudClasses(view) {
  const out = [];
  if (view.clean) out.push('clean');
  for (const k of Object.keys(FOLDS)) if (view.clean || view.folded[k]) out.push(`fold-${k}`);
  return out;
}
