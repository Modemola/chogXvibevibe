import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from '../components/Backdrop';
import { Canvas, tint } from '../components/Canvas';
import { Orb, unitPx } from '../components/Orb';
import { Headline, Kicker } from '../components/Type';
import { C, F, clamp, expoOut, lerp, ramp, softInOut, vis } from '../theme';
import { effectiveTime, problemPoint, world } from '../world';
import { orbRadius } from './Open';

/** Price path: rises through the airdrop, collapses as dumpers sell. */
function price(x: number, te: number) {
  const rise = Math.pow(x, 1.4) * 0.8 + Math.sin(x * 19) * 0.03 + Math.sin(x * 47) * 0.012;
  const crashAt = 0.62;
  const crash = clamp((te - 13.2) / 4.2);
  const after = clamp((x - crashAt) / (1 - crashAt));
  const drop = softInOut(crash) * after * 1.25;
  return rise - drop;
}

/** 0:15–0:40. The orb shatters into wallets; farms cluster, dumpers flee, the price collapses. */
export function Problem() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 60;
  const te = effectiveTime(t);
  const u = Math.min(width / 1920, height / 1080);
  const g = world(width, height);
  const portrait = height > width;
  const R = orbRadius(width, height);
  const margin = portrait ? 90 : 160;
  const chartTop = g.lineY + 40 * u;
  const chartH = height - chartTop - 110 * u;

  return (
    <AbsoluteFill>
      <Backdrop />
      {t < 0.4 && <Orb time={55 + t} drops={[{ x: 0, y: 0, r: R * lerp(1, 1.12, expoOut(clamp(t / 0.3))), opacity: 1 - clamp(t / 0.28), wobble: 0.1 }]} />}
      <Canvas
        draw={(ctx, w, h) => {
          // The shatter: a brief silver flash where the orb was.
          if (t < 0.9) {
            const fl = Math.exp(-t * 6);
            const rad = R * unitPx(h) * (1.1 + t * 1.6);
            const rg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, rad);
            rg.addColorStop(0, `rgba(240,244,248,${0.55 * fl})`);
            rg.addColorStop(1, 'rgba(240,244,248,0)');
            ctx.fillStyle = rg;
            ctx.fillRect(0, 0, w, h);
          }
          // Graduation line.
          const lk = ramp(t, 1.2, 3.4, expoOut);
          const tail = 1 - ramp(t, 22.8, 24.8, softInOut);
          ctx.globalAlpha = tail;
          ctx.strokeStyle = 'rgba(214,219,225,0.55)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(w / 2 - (w / 2) * lk, g.lineY);
          ctx.lineTo(w / 2 + (w / 2) * lk, g.lineY);
          ctx.stroke();

          // Price chart under the line.
          const ck = ramp(t, 3, 9, softInOut);
          if (ck > 0) {
            const steps = 220;
            const pts: [number, number][] = [];
            for (let i = 0; i <= steps * ck; i++) {
              const x = i / steps;
              const v = price(x, te);
              pts.push([margin * u * 0.6 + x * (w - margin * u * 1.2), chartTop + chartH * (1 - clamp((v + 0.45) / 1.35, -0.1, 1.05))]);
            }
            const crash = clamp((te - 13.2) / 4.2);
            const grad = ctx.createLinearGradient(0, 0, w, 0);
            grad.addColorStop(0, 'rgba(214,219,225,0.15)');
            grad.addColorStop(0.55, 'rgba(214,219,225,0.75)');
            grad.addColorStop(0.7, `rgba(${Math.round(lerp(214, 240, crash))},${Math.round(lerp(219, 138, crash))},${Math.round(lerp(225, 156, crash))},0.9)`);
            grad.addColorStop(1, `rgba(${Math.round(lerp(214, 240, crash))},${Math.round(lerp(219, 138, crash))},${Math.round(lerp(225, 156, crash))},0.9)`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 2.6 * u;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.stroke();
            const last = pts[pts.length - 1];
            if (last) {
              ctx.fillStyle = crash > 0.05 ? tint(crash, 1) : 'rgba(238,241,244,1)';
              ctx.beginPath();
              ctx.arc(last[0], last[1], 4.5 * u, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          ctx.globalAlpha = 1;
          // Wallets.
          for (const p of g.particles) {
            const q = problemPoint(g, p, t);
            if (q.alpha <= 0.01 || q.x < -50 || q.x > w + 50 || q.y < -50) continue;
            if (p.role === 'dumper' && (q.px !== q.x || q.py !== q.y)) {
              const tr = ctx.createLinearGradient(q.px, q.py, q.x, q.y);
              tr.addColorStop(0, tint(q.rose, 0));
              tr.addColorStop(1, tint(q.rose, Math.min(1, q.alpha * 1.4)));
              ctx.strokeStyle = tr;
              ctx.lineWidth = q.size * 1.3;
              ctx.beginPath();
              ctx.moveTo(q.px, q.py);
              ctx.lineTo(q.x, q.y);
              ctx.stroke();
            }
            ctx.fillStyle = tint(q.rose, q.alpha);
            ctx.beginPath();
            ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2);
            ctx.fill();
          }

          // Farm rings.
          const fk = ramp(te, 10.6, 12.6, expoOut) * (1 - ramp(t, 23.4, 24.6, softInOut));
          if (fk > 0) {
            g.farms.forEach((f, i) => {
              const sync = Math.sin(te * 1.7 + i) * 26 * u;
              ctx.strokeStyle = `rgba(240,138,156,${0.6 * fk})`;
              ctx.lineWidth = 1.2;
              ctx.setLineDash([4 * u, 6 * u]);
              ctx.beginPath();
              ctx.arc(f.x + sync, f.y + Math.cos(te * 1.7 + i) * 10 * u, 58 * u * lerp(1.4, 1, fk), 0, Math.PI * 2);
              ctx.stroke();
              ctx.setLineDash([]);
            });
          }
        }}
      />

      {/* Labels */}
      <div style={{ position: 'absolute', left: 0, top: 0, width, height, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: margin * u, top: g.lineY + 22 * u, opacity: vis(t, 2.6, 24.4) }}>
          <Kicker size={28 * u * (portrait ? 1.6 : 1)}>Graduation</Kicker>
        </div>
        {g.farms.map((f, i) => {
          const sync = Math.sin(te * 1.7 + i) * 26 * u;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: f.x + sync - 140 * u,
                width: 280 * u,
                top: f.y - 112 * u * (portrait ? 1.3 : 1),
                textAlign: 'center',
                fontFamily: F.mono,
                fontSize: 28 * u * (portrait ? 1.5 : 1),
                letterSpacing: '0.12em',
                color: C.bad,
                opacity: ramp(te, 11.2, 12.4) * (1 - ramp(t, 23.4, 24.4)),
              }}
            >
              FARM
            </div>
          );
        })}
        <div
          style={{
            position: 'absolute',
            right: margin * u,
            top: g.lineY + 40 * u,
            textAlign: 'right',
            fontFamily: F.mono,
            fontSize: 28 * u * (portrait ? 1.5 : 1),
            letterSpacing: '0.12em',
            color: C.bad,
            opacity: vis(t, 14.2, 21.6),
          }}
        >
          DUMPED WITHIN THE HOUR
        </div>
      </div>

      {/* Copy */}
      <div style={{ position: 'absolute', left: margin * u, top: (portrait ? 170 : 132) * u, width: width - margin * u * 2 }}>
        <Headline text="Every graduation, an *airdrop.*" t={t} at={3.4} out={8.7} size={100 * u * (portrait ? 1.45 : 1)} />
      </div>
      <div style={{ position: 'absolute', left: margin * u, top: (portrait ? 170 : 132) * u, width: width - margin * u * 2 }}>
        <Headline text="Most of it goes to *farms and dumpers.*" t={t} at={9.4} out={16.4} size={100 * u * (portrait ? 1.45 : 1)} />
      </div>
      <div style={{ position: 'absolute', left: margin * u, top: (portrait ? 170 : 132) * u, width: width - margin * u * 2 }}>
        <Headline text="The holders who stayed *pay for it.*" t={t} at={17.2} out={23.6} size={100 * u * (portrait ? 1.45 : 1)} />
      </div>
    </AbsoluteFill>
  );
}
