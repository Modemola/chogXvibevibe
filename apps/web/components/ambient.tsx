'use client';

import Lenis from 'lenis';
import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Domain-warped fbm aurora: violet, cyan and molten gold drifting in near-black. */
const FRAG = /* glsl */ `
precision highp float;
uniform float t;
uniform vec2 res;
uniform vec2 mouse;
uniform float scroll;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++){ v += a*noise(p); p = m*p; a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = (gl_FragCoord.xy - 0.5*res) / res.y;
  p.y += scroll * 0.18;
  float tt = t * 0.03;
  vec2 q = vec2(fbm(p*1.3 + tt), fbm(p*1.3 + vec2(5.2,1.3) - tt));
  vec2 r = vec2(fbm(p*1.5 + 3.0*q + vec2(1.7,9.2) + tt*1.3), fbm(p*1.5 + 3.0*q + vec2(8.3,2.8) - tt));
  float f = fbm(p*1.15 + 2.4*r + mouse*0.12);
  vec3 col = vec3(0.010, 0.012, 0.028);
  col = mix(col, vec3(0.30, 0.19, 0.86)*0.55, smoothstep(0.30, 0.82, f));
  col = mix(col, vec3(0.16, 0.62, 0.92)*0.40, smoothstep(0.45, 0.90, r.x) * 0.7);
  col = mix(col, vec3(0.96, 0.66, 0.30)*0.42, smoothstep(0.52, 0.95, q.y + 0.12*sin(tt*4.0 + scroll)) * 0.55);
  col *= mix(0.62, 1.1, smoothstep(-0.8, 0.7, p.y - scroll*0.18));
  col *= 1.0 - 0.5*length(uv - vec2(0.5, 0.45));
  col += (hash(gl_FragCoord.xy + t) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const VERT = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';

/** Full-screen living aurora. Renders at half resolution; it's soft by nature. */
export function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) return setFailed(true);
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return setFailed(true);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uT = gl.getUniformLocation(prog, 't');
    const uRes = gl.getUniformLocation(prog, 'res');
    const uMouse = gl.getUniformLocation(prog, 'mouse');
    const uScroll = gl.getUniformLocation(prog, 'scroll');

    const scale = 0.5;
    const resize = () => {
      canvas.width = Math.max(1, Math.floor(window.innerWidth * scale));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      mouse.tx = e.clientX / window.innerWidth - 0.5;
      mouse.ty = 0.5 - e.clientY / window.innerHeight;
    };
    window.addEventListener('pointermove', onMove);

    const still = prefersReducedMotion();
    let raf = 0;
    const start = performance.now() - 40_000;
    const frame = (now: number) => {
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      gl.uniform1f(uT, (now - start) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uScroll, window.scrollY / window.innerHeight);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!still && !document.hidden) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVis = () => {
      if (!document.hidden && !still) raf = requestAnimationFrame(frame);
    };
    const onScroll = () => still && requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <>
      <div className="backdrop-fallback" aria-hidden />
      {!failed && <canvas ref={ref} className="backdrop-canvas" aria-hidden />}
      <div className="vignette" aria-hidden />
      <div className="grain" aria-hidden />
    </>
  );
}

/** A soft light that trails the pointer, and the sheen coordinates glass surfaces read. */
export function CursorLight() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const pos = { x: window.innerWidth / 2, y: window.innerHeight / 3, tx: window.innerWidth / 2, ty: window.innerHeight / 3 };
    let raf = 0;
    const tick = () => {
      pos.x += (pos.tx - pos.x) * 0.12;
      pos.y += (pos.ty - pos.y) * 0.12;
      el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      pos.tx = e.clientX;
      pos.ty = e.clientY;
      const target = (e.target as Element | null)?.closest?.('.glass, .btn') as HTMLElement | null;
      if (target) {
        const r = target.getBoundingClientRect();
        target.style.setProperty('--mx', `${e.clientX - r.left}px`);
        target.style.setProperty('--my', `${e.clientY - r.top}px`);
      }
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);
  return <div ref={ref} className="cursor-light" aria-hidden />;
}

/** Inertial smooth scrolling (off for reduced motion and touch, where native is better). */
export function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion() || window.matchMedia('(hover: none)').matches) return;
    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);
  return null;
}
