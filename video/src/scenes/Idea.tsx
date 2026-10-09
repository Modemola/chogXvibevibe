import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from '../components/Backdrop';
import { Canvas, tint } from '../components/Canvas';
import { C, F, clamp, expoOut, lerp, ramp, rng, softInOut, vis } from '../theme';
import { problemPoint, world } from '../world';
import holder from '../data/holder.json';

const PRINCIPLES = [
  { n: '01', word: 'Opt-in', line: 'Wallets sign once to join. No transaction.' },
  { n: '02', word: 'Explainable', line: 'Every score splits into reasons that add up.' },
  { n: '03', word: 'Accountable', line: 'Every drop is measured after it lands.' },
];

const r = rng(7);
const SIG = Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('');

/** Grid slot for particle i of n, centred in the frame. */
function gridPos(i: number, n: number, w: number, h: number) {
  const portrait = h > w;
  const cols = portrait ? 30 : 54;
  const rows = Math.ceil(n / cols);
  const gap = Math.min((w * 0.84) / (cols - 1), (h * 0.74) / (rows - 1));
  const c = i % cols;
  const row = Math.floor(i / cols);
  return { x: w / 2 + (c - (cols - 1) / 2) * gap, y: h / 2 + (row - (rows - 1) / 2) * gap, c, row, cols, rows, gap };
}

/** 0:40–1:05. Time stops; the wallets align into a grid; three principles; a wallet signs. */
export function Idea() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 60;
  const u = Math.min(width / 1920, height / 1080);
  const portrait = height > width;
  const g = world(width, height);
  const n = g.particles.length;
  const chosen = Math.floor(n / 2) + Math.floor(gridPos(0, n, width, height).cols / 2);
  const target = { x: width / 2, y: height * (portrait ? 0.46 : 0.47) };

  // Dive into the signed wallet at the end.
  const dive = ramp(t, 22.6, 25, softInOut);
  const zoom = lerp(1, 26, dive ** 2.2);
  const nodeK = ramp(t, 14.6, 16.4, expoOut);
  const sigK = ramp(t, 16.2, 19.6, softInOut);
  const check = ramp(t, 19.8, 21, expoOut);

  return (
    <AbsoluteFill>
      <Backdrop />
      <Canvas
        draw={(ctx, w, h) => {
          ctx.save();
          ctx.translate(target.x, target.y);
          ctx.scale(zoom, zoom);
          ctx.translate(-target.x, -target.y);
          const gridDim = lerp(1, 0.22, ramp(t, 4.6, 6.4, softInOut)) * (1 - dive);
          g.particles.forEach((p, i) => {
            const from = problemPoint(g, p, 25);
            const gp = gridPos(i, n, w, h);
            const delay = (gp.c / gp.cols) * 1.2 + (gp.row / gp.rows) * 0.4;
            const k = softInOut(clamp((t - 0.4 - delay) / 2.6));
            let x = lerp(from.x, gp.x, k);
            let y = lerp(from.y, gp.y, k);
            const rose = lerp(from.rose, 0, k);
            let alpha = lerp(Math.max(from.alpha, p.role === 'dumper' ? 0.6 : 0), 0.62, k) * gridDim;
            let size = lerp(from.size, 2.2 * u, k);
            if (i === chosen && nodeK > 0) {
              x = lerp(x, target.x, nodeK);
              y = lerp(y, target.y, nodeK);
              alpha = lerp(alpha, 1, nodeK) * (1 - ramp(t, 19.4, 20, softInOut));
              size = lerp(size, 9 * u, nodeK);
            }
            ctx.fillStyle = tint(rose, alpha);
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
          });

          if (nodeK > 0) {
            // The wallet node and its ring.
            ctx.strokeStyle = `rgba(214,219,225,${0.7 * nodeK})`;
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.arc(target.x, target.y, lerp(10, 64, nodeK) * u, 0, Math.PI * 2);
            ctx.stroke();

            // A ribbon of signature hex flowing into the node, then collapsing into it.
            if (sigK > 0 && check < 1) {
              const chars = SIG.length;
              ctx.font = `500 ${32 * u}px ${F.mono}`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              for (let c = 0; c < chars; c++) {
                const along = c / chars;
                const head = lerp(-0.1, 1.15, sigK);
                if (along > head) continue;
                const startX = portrait ? w * 0.06 : w * 0.1;
                const px = lerp(startX, target.x - 90 * u, along);
                const py = target.y + Math.sin(along * 7 + t * 2.2) * 110 * u * (1 - along * 0.85);
                const collapse = ramp(t, 19.2, 20.2, softInOut);
                const x = lerp(px, target.x, collapse);
                const y = lerp(py, target.y, collapse);
                const fade = clamp((head - along) * 6) * (1 - collapse);
                ctx.fillStyle = `rgba(214,219,225,${0.85 * fade * (0.35 + along * 0.65)})`;
                ctx.fillText(SIG[c]!, x, y);
              }
            }
            if (check > 0) {
              ctx.globalAlpha = 1 - ramp(t, 23.6, 24.8, softInOut);
              ctx.fillStyle = `rgba(143,227,192,${0.12 * check})`;
              ctx.beginPath();
              ctx.arc(target.x, target.y, 64 * u, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = C.good;
              ctx.lineWidth = 4 * u;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              const p1 = { x: target.x - 22 * u, y: target.y + 2 * u };
              const p2 = { x: target.x - 6 * u, y: target.y + 18 * u };
              const p3 = { x: target.x + 26 * u, y: target.y - 18 * u };
              const k1 = clamp(check * 2);
              const k2 = clamp(check * 2 - 1);
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(lerp(p1.x, p2.x, k1), lerp(p1.y, p2.y, k1));
              if (k2 > 0) ctx.lineTo(lerp(p2.x, p3.x, k2), lerp(p2.y, p3.y, k2));
              ctx.stroke();
              ctx.globalAlpha = 1;
            }
          }
          ctx.restore();
        }}
      />

      {/* Three principles */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: 1 - ramp(t, 13.6, 14.6, softInOut) }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: portrait ? '1fr' : 'repeat(3, minmax(0, 1fr))',
            gap: (portrait ? 70 : 48) * u,
            width: portrait ? width * 0.8 : 1680 * u,
          }}
        >
          {PRINCIPLES.map((p, i) => {
            const at = 5.6 + i * 1.6;
            const k = ramp(t, at, at + 1.4, expoOut);
            return (
              <div key={p.n} style={{ opacity: k, transform: `translateY(${(1 - k) * 40 * u}px)`, filter: k < 1 ? `blur(${(1 - k) * 10}px)` : undefined, textAlign: portrait ? 'center' : 'left' }}>
                <div style={{ fontFamily: F.mono, fontSize: 28 * u * (portrait ? 1.4 : 1), letterSpacing: '0.2em', color: C.steel }}>{p.n}</div>
                <div
                  style={{
                    fontFamily: F.serif,
                    fontStyle: 'italic',
                    fontSize: 112 * u * (portrait ? 1.5 : 1),
                    whiteSpace: 'nowrap',
                    lineHeight: 1.05,
                    marginTop: 14 * u,
                    backgroundImage: C.chromeX,
                    backgroundSize: '240% 100%',
                    backgroundPosition: `${lerp(100, 0, ramp(t, at, at + 4, softInOut))}% 0`,
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                    paddingRight: '0.06em',
                  }}
                >
                  {p.word}
                </div>
                <div style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 32 * u * (portrait ? 1.35 : 1), lineHeight: 1.4, color: C.body, marginTop: 18 * u, maxWidth: 460 * u * (portrait ? 2 : 1), marginInline: portrait ? 'auto' : undefined }}>
                  {p.line}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* Signing labels */}
      <div style={{ position: 'absolute', left: 0, width, top: target.y + 108 * u, textAlign: 'center', opacity: vis(t, 15.4, 22.6) }}>
        <div style={{ fontFamily: F.mono, fontSize: 32 * u * (portrait ? 1.3 : 1), color: C.ink, letterSpacing: '0.04em' }}>
          {holder.wallet.slice(0, 6)}…{holder.wallet.slice(-4)}
        </div>
        <div style={{ marginTop: 16 * u, fontFamily: F.mono, fontSize: 28 * u * (portrait ? 1.3 : 1), letterSpacing: '0.18em', color: check > 0.5 ? C.good : C.steel, textTransform: 'uppercase' }}>
          {check > 0.5 ? 'Signed · opted in · no transaction' : 'personal_sign · opt-in message'}
        </div>
      </div>
    </AbsoluteFill>
  );
}
