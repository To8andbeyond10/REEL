// The first-launch tutorial: a short coached walk through catching your first fish.
// Steps move on when the player does the thing (an event from the game) or presses Next.
// It runs once for a new angler and can be replayed any time from How to play.

export const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Genesis Lake',
    text: "This quick tutorial walks you through catching your first fish, then how your rod, reel, line and lures change the game. You can skip it now and replay it any time from How to play (H).",
    next: true
  },
  {
    id: 'look',
    title: 'Look around',
    text: 'Move the mouse to aim. A and D turn too. On a phone, drag the screen.',
    until: 'look',
    next: true
  },
  {
    id: 'cast',
    title: 'Cast',
    text: 'Hold left click or Space to build power, then let go to cast. The meter swings back and forth, so release near the top for a long cast.',
    touch: 'Hold Cast / Reel to build power, then let go to cast. Release near the top of the meter for a long cast. Drag the screen to aim.',
    until: 'cast'
  },
  {
    id: 'wait',
    title: 'Watch the float',
    text: "You're float fishing with a worm. Fish nibble first, then pull the float under. Q and E set how deep the worm hangs. Bored of waiting? Z speeds up time.",
    touch: "You're float fishing with a worm. Fish nibble first, then pull the float under. Bored of waiting? Time ×20 on the menu bar speeds things up.",
    until: 'bite'
  },
  {
    id: 'strike',
    title: 'Strike!',
    text: 'When the float goes under and STRIKE! flashes, right click or press F to set the hook. Too early and the fish spooks.',
    touch: 'When the float goes under and STRIKE! flashes, tap Strike / Lift to set the hook. Too early and the fish spooks.',
    until: 'hooked'
  },
  {
    id: 'fight',
    title: 'Fish on',
    text: 'Hold left click or Space to reel while the tension bar is green. Stop when the fish runs or shakes its head. Hold right click to lift the rod and tire it. The mouse wheel sets the drag.',
    touch: 'Hold Cast / Reel while the tension bar is green. Let go when the fish runs or shakes its head. Hold Strike / Lift to lift the rod and tire it. Drag − and + set the drag.',
    until: 'fight-end'
  },
  {
    id: 'catch',
    title: 'Your first fish',
    text: 'Bag it to sell later, sell it now at a 20% discount, or release it for extra XP. Trophy photo saves a picture.',
    until: 'catch-done'
  },
  {
    id: 'tackle',
    title: 'Your tackle matters',
    text: 'Every part of your setup changes what you can catch and how the fight goes. Open Tackle (T) to see yours, then close it to carry on.',
    until: 'panel:tackle',
    next: true
  },
  {
    id: 'rod-reel',
    title: 'Rod and reel',
    text: 'Rod: longer rods cast further, max load is how hard it can pull before it snaps, and a softer rod cushions head shakes. Reel: max drag is how hard it can hold a running fish, retrieve is how fast it winds in, and the spool is how much line it holds. A big fish can strip a small spool.',
    next: true
  },
  {
    id: 'line',
    title: 'Line',
    text: "Line strength is the pull that snaps it, so set the drag below it. Mono stretches and forgives shakes. Fluoro is nearly invisible, so wary fish bite more. Braid is very strong but doesn't stretch, so shakes hit hard.",
    next: true
  },
  {
    id: 'rigs',
    title: 'Rigs and lures',
    text: 'Float rigs hang bait at a set depth: wait for the dip. Lures only work when moving: spinners on a steady retrieve, jigs hopped and dropped, poppers on the surface, crankbaits fast and deep. Bottom rigs sit still for catfish. Each fish has favourites, and How to play (H) lists them.',
    next: true
  },
  {
    id: 'market',
    title: 'Sell at the Fish Market',
    text: 'Every species trades like a coin and its price moves all day. Open the Fish Market (B) to sell your bag when the price is up. You earn REEL to spend on better tackle.',
    until: 'panel:market',
    next: true
  },
  {
    id: 'explore',
    title: "You're ready",
    text: 'The Map (M) moves you to new spots and waters. Missions (O) has contracts and derbies. The Store (U) has float and rod looks. How to play (H) explains everything. Tight lines!',
    next: true,
    last: true
  }
];

const indexOf = (id) => STEPS.findIndex((s) => s.id === id);

export function createTutorial() {
  return { step: 0, note: '', done: false };
}

export const currentStep = (t) => (t && !t.done ? STEPS[t.step] : null);

function goTo(t, id, note = '') {
  t.step = indexOf(id);
  t.note = note;
}

// Feeds a game event into the tutorial. Returns true when the step changed.
export function tutorialEvent(t, event) {
  const step = currentStep(t);
  if (!step) return false;
  // Setbacks send you back to the step that fixes them.
  if (event === 'missed' && (step.id === 'strike' || step.id === 'wait')) {
    goTo(t, 'wait', 'Missed that one. Leave the float out; another fish will come.');
    return true;
  }
  if (event === 'lost' && step.id === 'fight') {
    goTo(t, 'cast', 'It got away. Cast again. Ease off the reel when the tension bar turns red.');
    return true;
  }
  if (event === 'reeled-in' && (step.id === 'wait' || step.id === 'strike')) {
    goTo(t, 'cast', 'Your line came back in. Cast again.');
    return true;
  }
  if (event === 'next') {
    if (!step.next) return false;
    if (step.last) {
      t.done = true;
      return true;
    }
    t.step += 1;
    t.note = '';
    return true;
  }
  // The player can run ahead (cast before reading the look step, say): jump to just past the
  // step they've done. Only within the catch itself, so opening a menu early doesn't skip it.
  const target = STEPS.findIndex((s, i) => i >= t.step && s.until === event);
  if (target < 0 || (target > t.step && target > indexOf('catch'))) return false;
  if (STEPS[target].last) {
    t.done = true;
    return true;
  }
  t.step = target + 1;
  t.note = '';
  return true;
}
