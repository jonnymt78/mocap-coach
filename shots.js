// The owner's motion capture shot list (Rogue Kingdom, 2026-11-02), as the coach runs it.
// kind: still = hold a stance, loop = repeating motion, shot = one action (reps times), fall = ends on the ground,
// kneel = goes down and comes back up. secs = recording length per take (per rep for shots).
// sideOnly: record side-on only. frontOnly: record facing the camera only. both: one-sided move (a weapon or tool in one
// hand, a shield on the other arm), so it gets a side-on take from each side.
export const SESSIONS = [
  { name: "1. Battle loops", note: "The loops seen most in battle. About 30 minutes." },
  { name: "2. Fighting", note: "Attacks, blocks, hits, deaths, pike and bow actions." },
  { name: "3. Riders, crews, menu", note: "Sit astride a stool for the riders." },
  { name: "4. Workers and acting", note: "Work loops and everyday acting moves." },
];

export const SHOTS = [
  // Session 1: battle loops
  { id: "A01", s: 0, name: "Idle", say: "Stand at ease. Shift your weight a little, breathe, glance around now and then.", kind: "still", secs: 20, prop: "sword stick in your right hand" },
  { id: "A02", s: 0, name: "Attention", say: "Stand to attention. Chin up, still.", kind: "still", secs: 10, prop: "sword stick at your side" },
  { id: "A03", s: 0, name: "Walk", say: "Steady marching walk, on the spot.", kind: "loop", secs: 10, prop: "sword stick", both: true },
  { id: "A04", s: 0, name: "Run", say: "Run on the spot. A running pace, not a sprint.", kind: "loop", secs: 8, prop: "sword stick", both: true },
  { id: "B01", s: 0, name: "Idle, pike", say: "Stand holding the pole upright, both hands on it.", kind: "still", secs: 20, prop: "broom handle" },
  { id: "B02", s: 0, name: "Walk, pike", say: "March on the spot, pole carried across your body, both hands.", kind: "loop", secs: 10, prop: "broom handle", both: true },
  { id: "B03", s: 0, name: "Run, pike", say: "Run on the spot, pole carried across your body.", kind: "loop", secs: 8, prop: "broom handle", both: true },
  { id: "B10", s: 0, name: "Idle, bow", say: "Stand relaxed, bow in your left hand.", kind: "still", secs: 20, prop: "stick for the bow" },
  { id: "B11", s: 0, name: "Walk, bow", say: "Walk on the spot, bow in your left hand.", kind: "loop", secs: 10, prop: "stick for the bow", both: true },
  { id: "B12", s: 0, name: "Run, bow", say: "Run on the spot with the bow.", kind: "loop", secs: 8, prop: "stick for the bow", both: true },

  // Session 2: fighting
  { id: "A05", s: 1, name: "Melee", say: "One-handed overhead or diagonal sword strike, then back to ready.", kind: "shot", secs: 5, reps: 3, prop: "sword stick and shield", both: true },
  { id: "A06", s: 1, name: "Thrust", say: "One-handed stab forward, then back to ready.", kind: "shot", secs: 5, reps: 3, prop: "sword stick and shield", both: true },
  { id: "A07", s: 1, name: "Charge", say: "Three running steps on the spot into a big swing.", kind: "shot", secs: 6, reps: 3, prop: "sword stick and shield", both: true },
  { id: "A08", s: 1, name: "Block", say: "Raise the shield to take a hit, hold a moment, lower it.", kind: "shot", secs: 5, reps: 3, prop: "shield", both: true },
  { id: "A09", s: 1, name: "Flinch", say: "Get hit. Jolt back, stagger, recover to ready.", kind: "shot", secs: 5, reps: 3, prop: "sword stick", both: true },
  { id: "A10", s: 1, name: "Death, backwards", say: "Hit from the front. Fall onto your back onto the cushions, then lie still.", kind: "fall", secs: 8, reps: 3, prop: "let the stick drop" },
  { id: "A11", s: 1, name: "Death, crumple", say: "Knees give way. Crumple forward and to the side, then lie still.", kind: "fall", secs: 8, reps: 3, prop: "let the stick drop" },
  { id: "A12", s: 1, name: "Kneel", say: "Go down on your right knee, hold, then stand back up.", kind: "kneel", secs: 8, reps: 3, prop: "sword stick", both: true },
  { id: "A13", s: 1, name: "Exhausted", say: "Bent over, hands on your knees, catching your breath.", kind: "still", secs: 15, prop: "none" },
  { id: "B04", s: 1, name: "Thrust, pike", say: "Two-handed thrust forward, then recover.", kind: "shot", secs: 5, reps: 3, prop: "broom handle", both: true },
  { id: "B05", s: 1, name: "Chop, halberd", say: "Two-handed chopping swing from high, then recover.", kind: "shot", secs: 5, reps: 3, prop: "broom handle", both: true },
  { id: "B06", s: 1, name: "Block, pike", say: "Raise the shaft across to block, hold, lower.", kind: "shot", secs: 5, reps: 3, prop: "broom handle", both: true },
  { id: "B07", s: 1, name: "Throw", say: "Throw a spear overarm, then recover.", kind: "shot", secs: 5, reps: 3, prop: "rolled towel", both: true },
  { id: "B13", s: 1, name: "Shoot, bow", say: "Draw an arrow, nock, draw, aim, release, lower.", kind: "shot", secs: 7, reps: 3, prop: "stick for the bow", both: true },
  { id: "B15", s: 1, name: "Idle, crossbow", say: "Stand with the crossbow at your right hip, both hands.", kind: "still", secs: 15, prop: "stick or box" },
  { id: "B16", s: 1, name: "Shoot, crossbow", say: "Raise to the shoulder, aim, shoot, lower to the hip.", kind: "shot", secs: 6, reps: 3, prop: "stick or box", both: true },
  { id: "B17", s: 1, name: "Reload, crossbow", say: "Tip it down, foot in the stirrup, pull the string back, load a bolt.", kind: "shot", secs: 8, reps: 3, prop: "stick or box", both: true },

  // Session 3: riders, crews, menu
  { id: "B20", s: 2, name: "Ride, idle", say: "Sit astride the stool, reins in your left hand, small balancing moves.", kind: "still", secs: 15, prop: "stool" },
  { id: "B21a", s: 2, name: "Ride, walk", say: "Gentle bounce in the seat.", kind: "loop", secs: 10, prop: "stool" },
  { id: "B21b", s: 2, name: "Ride, trot", say: "Rising trot, up and down.", kind: "loop", secs: 10, prop: "stool" },
  { id: "B21c", s: 2, name: "Ride, gallop", say: "Lean forward, fast rhythm.", kind: "loop", secs: 10, prop: "stool" },
  { id: "B22", s: 2, name: "Ride, strike", say: "A sword strike from the saddle, down to the right.", kind: "shot", secs: 5, reps: 3, prop: "stool, sword stick", both: true },
  { id: "B23", s: 2, name: "Ride, charge", say: "Lance levelled forward, lean in.", kind: "shot", secs: 5, reps: 3, prop: "stool, broom handle", both: true },
  { id: "B24", s: 2, name: "Ride, block", say: "Shield up from the saddle.", kind: "shot", secs: 5, reps: 3, prop: "stool, shield", both: true },
  { id: "B25", s: 2, name: "Ride, flinch", say: "Hit while riding. Jolt, recover.", kind: "shot", secs: 5, reps: 3, prop: "stool", both: true },
  { id: "B26", s: 2, name: "Ride, death", say: "Slump and slide off to your left onto the cushions.", kind: "fall", secs: 8, reps: 3, prop: "stool, cushions" },
  { id: "B30", s: 2, name: "Gun loader", say: "Ram a charge down the barrel with the long pole. Push, push, pull out.", kind: "shot", secs: 7, reps: 3, prop: "broom", both: true },
  { id: "B31", s: 2, name: "Gun second", say: "Stoop, lift a heavy ball with both hands, two steps, lift it into the muzzle.", kind: "shot", secs: 7, reps: 3, prop: "ball or cushion", both: true },
  { id: "B32", s: 2, name: "Gun watcher", say: "Stand back, cover your ears, watch where it lands, point.", kind: "shot", secs: 7, reps: 3, prop: "none", both: true },
  { id: "B33", s: 2, name: "Handspike", say: "Lever the gun's trail sideways with a long bar.", kind: "shot", secs: 6, reps: 3, prop: "broom", both: true },
  { id: "C01", s: 2, name: "Menu bard", say: "Sit on the stool, strumming a lute.", kind: "still", secs: 20, prop: "stool, racket or board" },
  { id: "C02", s: 2, name: "Menu sharpener", say: "Sit and draw a whetstone along a sword on your knees.", kind: "still", secs: 20, prop: "stool, sword stick" },
  { id: "C03", s: 2, name: "Menu sleeper", say: "Lie on your back asleep, slow breathing, one small shift.", kind: "still", secs: 20, prop: "cushions", sideOnly: true },

  // Session 4: workers and acting
  { id: "B40", s: 3, name: "Chop", say: "Axe chopping a tree at waist height.", kind: "loop", secs: 15, prop: "stick", both: true },
  { id: "B41", s: 3, name: "Mine", say: "Pickaxe swinging down at a rock face.", kind: "loop", secs: 15, prop: "stick", both: true },
  { id: "B42", s: 3, name: "Quarry", say: "Two-handed sledge onto a block at your feet.", kind: "loop", secs: 15, prop: "broom", both: true },
  { id: "B43", s: 3, name: "Hoe", say: "Hoeing a row, small steps back.", kind: "loop", secs: 15, prop: "broom", both: true },
  { id: "B44", s: 3, name: "Build", say: "Hammering at chest height, then at knee height.", kind: "loop", secs: 15, prop: "stick", both: true },
  { id: "B45", s: 3, name: "Carry sack", say: "Walk on the spot carrying a heavy sack on your shoulder.", kind: "loop", secs: 10, prop: "cushion" },
  { id: "B46", s: 3, name: "Carry crate", say: "Walk on the spot carrying a crate in front, both arms.", kind: "loop", secs: 10, prop: "box" },
  { id: "B47", s: 3, name: "Train", say: "Practice swings at a post.", kind: "loop", secs: 15, prop: "sword stick", both: true },
  { id: "D01", s: 3, name: "Walk, calm", say: "Relaxed walk on the spot, arms loose.", kind: "loop", secs: 10, prop: "none" },
  { id: "D02", s: 3, name: "Walk, urgent", say: "Fast, purposeful walk on the spot.", kind: "loop", secs: 10, prop: "none" },
  { id: "D03", s: 3, name: "Run, flee", say: "Run on the spot, glance back once.", kind: "loop", secs: 8, prop: "none" },
  { id: "D05", s: 3, name: "Sit down, stand up", say: "Sit onto the stool, settle, then stand up.", kind: "kneel", secs: 8, reps: 2, prop: "stool" },
  { id: "D06", s: 3, name: "Sit, throne", say: "Sit tall and commanding, hands on your knees as armrests.", kind: "still", secs: 15, prop: "stool" },
  { id: "D07", s: 3, name: "Sit, slumped", say: "Sit defeated, leaning forward, head down.", kind: "still", secs: 15, prop: "stool" },
  { id: "D08", s: 3, name: "Kneel in respect", say: "Kneel on one knee, head bowed, hold, then rise.", kind: "kneel", secs: 8, reps: 2, prop: "none" },
  { id: "D09", s: 3, name: "Bow", say: "A respectful bow from standing.", kind: "shot", secs: 5, reps: 2, prop: "none" },
  { id: "D10", s: 3, name: "Talk, calm", say: "Talk calmly with small hand gestures.", kind: "still", secs: 15, prop: "none" },
  { id: "D11", s: 3, name: "Talk, angry", say: "Argue. Sharp gestures, a step forward.", kind: "still", secs: 15, prop: "none" },
  { id: "D12", s: 3, name: "Point", say: "Point at something far away, hold, lower.", kind: "shot", secs: 5, reps: 2, prop: "none", both: true },
  { id: "D13", s: 3, name: "Look around", say: "Look left, right and up, a little wary.", kind: "still", secs: 12, prop: "none" },
  { id: "D14", s: 3, name: "Pick up", say: "Bend, pick up something small, look at it.", kind: "shot", secs: 6, reps: 2, prop: "anything small", both: true },
  { id: "D15", s: 3, name: "Hand over", say: "Hand an object to someone in front of you.", kind: "shot", secs: 5, reps: 2, prop: "anything small", both: true },
  { id: "D16", s: 3, name: "Read letter", say: "Unfold and read a letter in both hands, react.", kind: "shot", secs: 8, reps: 2, prop: "paper" },
  { id: "D17", s: 3, name: "Open door", say: "Push a door open and step through.", kind: "shot", secs: 5, reps: 2, prop: "none" },
  { id: "D18", s: 3, name: "Torch high", say: "Hold a torch up high to see.", kind: "still", secs: 12, prop: "stick" },
  { id: "D19", s: 3, name: "Reach table", say: "Lean over a table, reach across, move a marker.", kind: "shot", secs: 6, reps: 2, prop: "none", both: true },
  { id: "D20", s: 3, name: "Look up", say: "Look up at something high, shading your eyes.", kind: "still", secs: 10, prop: "none" },
  { id: "D21", s: 3, name: "Wake up", say: "Lying asleep, wake with a start and sit up.", kind: "shot", secs: 8, reps: 2, prop: "cushions", sideOnly: true },
  { id: "D22", s: 3, name: "Crouch and hide", say: "Crouch low behind cover, peek over.", kind: "still", secs: 12, prop: "none" },
  { id: "D23", s: 3, name: "Cheer", say: "Raise a fist and cheer.", kind: "shot", secs: 4, reps: 2, prop: "none" },
  { id: "D24", s: 3, name: "Grieve", say: "Hands to your face, shoulders shaking.", kind: "still", secs: 10, prop: "none" },
  { id: "D25", s: 3, name: "Stumble and get up", say: "Stumble, fall to your hands and knees, get back up.", kind: "kneel", secs: 8, reps: 2, prop: "cushions" },
];

// Moves whose side-on take matters most (depth). With "side takes: key moves only", these and every two-sided move get one.
export const KEY_SIDE = new Set(["A03", "A04", "A05", "A06", "A07", "A10", "A11", "A12", "B02", "B03", "B04", "B05", "B07", "B11", "B12", "B13", "B21a", "B21b", "B21c", "B26", "D01", "D02", "D03"]);
