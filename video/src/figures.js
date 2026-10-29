// Siluetas articuladas de papel recortado.
// Coordenadas locales: pies en (0,0), arriba es -y, +x es "hacia delante".
// Medidas de diseño para una figura de 300 unidades de altura.

const THIGH = 68, SHIN = 66, ANKLE = 9;
const UPPER = 58, FORE = 54;

function rot(x, y, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

/**
 * Calcula la pose (articulaciones en coordenadas locales de diseño, altura 300).
 * p: { walk, phase, crouch, lean, bow, armF:{sh,el}, armB:{sh,el} }
 */
export function computePose(p) {
  const walk = p.walk || 0, ph = (p.phase || 0) * Math.PI * 2, c = p.crouch || 0;
  const A = Math.sin(ph) * 0.42 * walk;
  const legs = [];
  for (let i = 0; i < 2; i++) {
    const sgn = i === 0 ? 1 : -1;
    const sw = sgn * A;
    const kneeBend = (0.08 + 0.42 * Math.max(0, Math.sin(ph + (i ? Math.PI : 0) + Math.PI * 0.55))) * walk + 1.5 * c;
    const thigh = sw + 0.85 * c;
    const shin = thigh - kneeBend;
    legs.push({ thigh, shin });
  }
  const legH = (l) => THIGH * Math.cos(l.thigh) + SHIN * Math.cos(l.shin) + ANKLE;
  const hipY = -Math.max(legH(legs[0]), legH(legs[1]));
  const hipX = -10 * c;
  const lean = (p.lean || 0) + 0.55 * c + 0.12 * (p.bow || 0);
  const sh = (a) => a || { sh: 0.12, el: 0.18 };
  const armF = sh(p.armF), armB = sh(p.armB);
  // hombro en el marco del torso (rotado por lean alrededor de la cadera)
  const [sx, sy] = rot(0, -108, lean);
  const shoulder = [hipX + sx, hipY + sy];
  const hand = (arm) => {
    // ángulos relativos a la vertical del mundo (no del torso) + inclinación
    const a1 = arm.sh + lean * 0.3, a2 = arm.sh + arm.el + lean * 0.3;
    const ex = shoulder[0] + Math.sin(a1) * UPPER, ey = shoulder[1] + Math.cos(a1) * UPPER;
    const hx = ex + Math.sin(a2) * FORE, hy = ey + Math.cos(a2) * FORE;
    return { elbow: [ex, ey], hand: [hx, hy], a1, a2 };
  };
  return { legs, hipX, hipY, lean, shoulder, armF: hand(armF), armB: hand(armB) };
}

function limb(ctx, pts, w) {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

/**
 * Dibuja una persona. o: {
 *   kind: 'man'|'woman'|'priest'|'boy'|'oldman'|'girl', ink, edge (color de recorte),
 *   hat: 'cap'|'beret'|'mantilla'|'none', hatColor, headTurn (1 delante .. -1 detrás),
 *   bow, ...pose }
 */
export function drawPerson(ctx, o) {
  const P = computePose(o);
  const ink = o.ink || '#1b1714';
  const kind = o.kind || 'man';
  const kid = kind === 'boy' || kind === 'girl';
  ctx.save();
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // --- Brazo trasero (tras el cuerpo)
  drawArm(ctx, P, P.armB, ink, null, kid);

  // --- Piernas
  const legW = kind === 'woman' || kind === 'girl' ? 12 : kid ? 17 : 21;
  for (const l of P.legs) {
    const hip = [P.hipX + (kind === 'priest' ? 0 : 0), P.hipY];
    const knee = [hip[0] + Math.sin(l.thigh) * THIGH, hip[1] + Math.cos(l.thigh) * THIGH];
    const ankle = [knee[0] + Math.sin(l.shin) * SHIN, knee[1] + Math.cos(l.shin) * SHIN];
    if (kind !== 'priest') limb(ctx, [hip, knee, ankle], legW);
    // pie
    const fa = Math.max(-0.5, Math.min(0.5, (l.shin) * 0.6));
    ctx.save();
    ctx.translate(ankle[0], ankle[1]);
    ctx.rotate(-fa * 0.4);
    ctx.beginPath();
    ctx.moveTo(-7, -6);
    ctx.quadraticCurveTo(6, -12, 26, -2);
    ctx.lineTo(26, 6);
    ctx.lineTo(-8, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // --- Torso (+ falda / sotana / abrigo)
  ctx.save();
  ctx.translate(P.hipX, P.hipY);
  ctx.rotate(P.lean);
  ctx.beginPath();
  if (kind === 'woman' || kind === 'girl') {
    const hem = kid ? 70 : 96;
    ctx.moveTo(-17, -112);
    ctx.quadraticCurveTo(0, -122, 16, -112);
    ctx.quadraticCurveTo(26, -84, 18, -52);
    ctx.quadraticCurveTo(14, -20, 17, -6);
    ctx.quadraticCurveTo(32, 40 + 0 * hem, 44 + (o.walk || 0) * 6 * Math.sin((o.phase || 0) * 6.283), hem);
    ctx.quadraticCurveTo(0, hem + 6, -44, hem - 2);
    ctx.quadraticCurveTo(-30, 30, -20, -6);
    ctx.quadraticCurveTo(-26, -60, -17, -112);
  } else if (kind === 'priest') {
    ctx.moveTo(-18, -112);
    ctx.quadraticCurveTo(0, -122, 17, -112);
    ctx.quadraticCurveTo(28, -70, 24, -20);
    ctx.quadraticCurveTo(40, 60, 50, -P.hipY - 4);
    ctx.lineTo(-48, -P.hipY - 4);
    ctx.quadraticCurveTo(-36, 40, -24, -30);
    ctx.quadraticCurveTo(-28, -80, -18, -112);
  } else {
    const coat = kind === 'boy' ? 6 : 34;
    ctx.moveTo(-19, -112);
    ctx.quadraticCurveTo(0, -122, 18, -112);
    ctx.quadraticCurveTo(28, -80, 24, -40);
    ctx.lineTo(24, coat);
    ctx.lineTo(-23, coat);
    ctx.quadraticCurveTo(-26, -40, -24, -70);
    ctx.quadraticCurveTo(-26, -100, -19, -112);
  }
  ctx.closePath();
  ctx.fill();

  // --- Cabeza
  const bow = o.bow || 0;
  const turn = o.headTurn === undefined ? 1 : o.headTurn;
  ctx.save();
  ctx.translate(2, -116);
  ctx.rotate(bow * 0.62);
  ctx.fillRect(-6, -14, 13, 16); // cuello
  const r = kid ? 22 : 19;
  const hy = -14 - r * 0.92;
  ctx.beginPath();
  ctx.ellipse(2 * turn, hy, r * 0.96, r, 0, 0, Math.PI * 2);
  ctx.fill();
  // nariz y barbilla según hacia dónde mira
  if (Math.abs(turn) > 0.05) {
    const nx = (2 + r * 0.9) * turn;
    ctx.beginPath();
    ctx.moveTo(nx - 2 * turn, hy - 4);
    ctx.lineTo(nx + 7 * turn, hy + 4);
    ctx.lineTo(nx - 1 * turn, hy + 7);
    ctx.closePath();
    ctx.fill();
  }
  drawHat(ctx, o, r, hy, turn);
  ctx.restore();

  // --- Brazo delantero, con un fino borde de recorte para separarlo del cuerpo
  ctx.restore(); // fin del marco del torso
  drawArm(ctx, P, P.armF, ink, o.edge, kid, o.holding);
  ctx.restore();
  return P;
}

function drawArm(ctx, P, arm, ink, edge, kid, holding) {
  const pts = [P.shoulder, arm.elbow, arm.hand];
  const w = kid ? 13 : 15;
  if (edge) {
    ctx.save();
    ctx.strokeStyle = edge;
    limb(ctx, pts, w + 4);
    ctx.restore();
  }
  ctx.strokeStyle = ink;
  limb(ctx, pts, w);
  ctx.beginPath();
  ctx.arc(arm.hand[0], arm.hand[1], 8, 0, Math.PI * 2);
  ctx.fill();
  if (holding === 'book') {
    ctx.save();
    ctx.translate(arm.hand[0], arm.hand[1]);
    ctx.rotate(-0.25);
    ctx.fillRect(-4, -16, 30, 22);
    ctx.restore();
  }
}

function drawHat(ctx, o, r, hy, turn) {
  const hat = o.hat || 'none';
  if (hat === 'none') return;
  ctx.save();
  if (hat === 'cap') {
    ctx.beginPath();
    ctx.ellipse(1 * turn, hy - r * 0.55, r * 1.05, r * 0.5, 0, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse((r * 0.9) * turn, hy - r * 0.5, r * 0.55, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (hat === 'beret') {
    ctx.fillStyle = o.hatColor || ctx.fillStyle;
    ctx.translate(-2 * turn, hy - r * 0.62);
    ctx.rotate(-0.22 * turn);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.25, r * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-1.5, -r * 0.62, 3, r * 0.3);
  } else if (hat === 'mantilla') {
    ctx.beginPath();
    ctx.moveTo(r * 0.9 * turn, hy - r * 0.2);
    ctx.quadraticCurveTo(r * 0.4 * turn, hy - r * 1.35, -r * 0.9 * turn, hy - r * 0.5);
    ctx.quadraticCurveTo(-r * 1.8 * turn, hy + r * 1.2, -r * 1.2 * turn, hy + r * 2.1);
    ctx.lineTo(-r * 0.2 * turn, hy + r * 1.2);
    ctx.closePath();
    ctx.fill();
  } else if (hat === 'skull') {
    ctx.beginPath();
    ctx.ellipse(0, hy - r * 0.8, r * 0.55, r * 0.3, 0, Math.PI, 0);
    ctx.fill();
  }
  ctx.restore();
}

/** Mano delantera en coordenadas locales (para atar cuerdas, soltar tierra, etc.). */
export function handLocal(o, which = 'armF') {
  const P = computePose(o);
  return P[which].hand;
}
