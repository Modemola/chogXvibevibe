'use client';

import { Sparkles } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Pointer + scroll, shared by everything in the scene. */
const input = { x: 0, y: 0, scroll: 0 };

function useInputs() {
  useEffect(() => {
    const move = (e: PointerEvent) => {
      input.x = (e.clientX / window.innerWidth) * 2 - 1;
      input.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    const scroll = () => (input.scroll = window.scrollY / window.innerHeight);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('scroll', scroll);
    };
  }, []);
}

const VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

/**
 * Liquid mercury: pure reflection of a procedural photo studio.
 * Chrome reads as chrome because of what it reflects, so the studio does the work:
 * an overhead softbox, two vertical strip lights, a horizon line and a travelling highlight.
 */
const FRAG = /* glsl */ `
uniform float uTime;
uniform float uYaw;
uniform float uPitch;
varying vec3 vWorld;
varying vec3 vNormal;

vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c*v.x + s*v.z, v.y, -s*v.x + c*v.z); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c*v.y - s*v.z, s*v.y + c*v.z); }

vec3 studio(vec3 r) {
  vec3 c = mix(vec3(0.018, 0.020, 0.024), vec3(0.11, 0.118, 0.13), smoothstep(-0.25, 0.65, r.y));
  float az = atan(r.x, r.z);
  // overhead softbox, rectangular-ish
  float top = smoothstep(0.80, 0.93, r.y) * smoothstep(1.2, 0.6, abs(az + 0.3));
  c += vec3(1.0) * top * 1.9;
  // vertical strip lights
  float band = smoothstep(-0.35, 0.15, r.y) * smoothstep(0.9, 0.55, r.y);
  c += vec3(0.96, 0.98, 1.0) * smoothstep(0.10, 0.02, abs(az - 1.15)) * band * 1.5;
  c += vec3(0.90, 0.93, 0.97) * smoothstep(0.07, 0.012, abs(az + 1.55)) * band * 1.0;
  c += vec3(0.80, 0.84, 0.90) * smoothstep(0.05, 0.008, abs(az - 2.6)) * band * 0.7;
  // horizon line and floor bounce
  c += vec3(0.62, 0.67, 0.74) * exp(-abs(r.y + 0.02) * 30.0) * 0.55;
  c += vec3(0.07, 0.075, 0.08) * smoothstep(-0.15, -0.9, r.y);
  // a slow travelling highlight
  float sweep = mod(uTime * 0.18, 6.2831) - 3.1416;
  c += vec3(1.0) * smoothstep(0.07, 0.0, abs(az - sweep)) * smoothstep(-0.1, 0.55, r.y) * 0.9;
  return c;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vWorld - cameraPosition);
  vec3 R = reflect(V, N);
  R = rotX(rotY(R, uYaw), uPitch);
  float fres = pow(1.0 - max(dot(-V, N), 0.0), 4.0);
  vec3 col = studio(R) * mix(0.82, 1.25, fres);
  col += vec3(0.85, 0.9, 1.0) * fres * 0.12;
  col *= vec3(0.97, 0.985, 1.02);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Smooth sum-of-sines noise: enough for a slow liquid surface. */
function wobble(x: number, y: number, z: number, t: number) {
  return (
    Math.sin(x * 1.7 + t * 0.7) * Math.cos(y * 1.5 - t * 0.55) * 0.5 +
    Math.sin(y * 2.1 + z * 1.3 + t * 0.9) * 0.3 +
    Math.cos(z * 1.9 - x * 1.1 + t * 0.5) * 0.2
  );
}

function Mercury({ detail }: { detail: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.ShaderMaterial>(null);
  // Welded (indexed) geometry, so recomputed normals are smooth rather than per-face facets.
  const geo = useMemo(() => {
    const g = mergeVertices(new THREE.IcosahedronGeometry(1.3, detail).deleteAttribute('normal').deleteAttribute('uv'));
    g.computeVertexNormals();
    return g;
  }, [detail]);
  const base = useMemo(() => Float32Array.from(geo.attributes.position!.array as Float32Array), [geo]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uYaw: { value: 0 }, uPitch: { value: 0 } }), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i]!, y = base[i + 1]!, z = base[i + 2]!;
      const k = 1 + wobble(x, y, z, t) * 0.07;
      arr[i] = x * k;
      arr[i + 1] = y * k;
      arr[i + 2] = z * k;
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    if (mat.current) {
      mat.current.uniforms.uTime!.value = t;
      // The studio turns with the pointer, so the reflections glide across the metal.
      mat.current.uniforms.uYaw!.value = THREE.MathUtils.lerp(mat.current.uniforms.uYaw!.value, input.x * 0.6, 0.04);
      mat.current.uniforms.uPitch!.value = THREE.MathUtils.lerp(mat.current.uniforms.uPitch!.value, -input.y * 0.25, 0.04);
    }
    if (mesh.current) mesh.current.rotation.y = t * 0.05;
  });
  return (
    <mesh ref={mesh} geometry={geo}>
      <shaderMaterial ref={mat} vertexShader={VERT} fragmentShader={FRAG} uniforms={uniforms} />
    </mesh>
  );
}

/** Two hairline silver orbits. */
function Orbits() {
  const a = useRef<THREE.Group>(null);
  const b = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (a.current) a.current.rotation.z += dt * 0.06;
    if (b.current) b.current.rotation.z -= dt * 0.04;
  });
  return (
    <>
      <group rotation={[1.32, 0.18, 0]}>
        <group ref={a}>
          <mesh>
            <torusGeometry args={[2.35, 0.004, 8, 256]} />
            <meshBasicMaterial color="#dfe4ea" transparent opacity={0.55} toneMapped={false} />
          </mesh>
          <mesh position={[2.35, 0, 0]}>
            <sphereGeometry args={[0.035, 16, 16]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
        </group>
      </group>
      <group rotation={[1.1, -0.5, 0.35]}>
        <group ref={b}>
          <mesh>
            <torusGeometry args={[2.9, 0.003, 8, 256]} />
            <meshBasicMaterial color="#aab1ba" transparent opacity={0.35} toneMapped={false} />
          </mesh>
          <mesh position={[0, 2.9, 0]}>
            <sphereGeometry args={[0.025, 16, 16]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
        </group>
      </group>
    </>
  );
}

function Rig({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, input.x * 0.18, 0.04);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, -input.y * 0.12, 0.04);
    g.position.y = THREE.MathUtils.lerp(g.position.y, input.scroll * 1.4, 0.08);
  });
  return <group ref={ref}>{children}</group>;
}

export default function HeroScene() {
  useInputs();
  const [visible, setVisible] = useState(true);
  const [detail, setDetail] = useState(48);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Lighter mesh on small or low-core devices.
    if (window.innerWidth < 760 || (navigator.hardwareConcurrency ?? 8) <= 4) setDetail(28);
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { rootMargin: '100px' });
    if (host.current) io.observe(host.current);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={host} className="hero-canvas">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 7.6], fov: 32 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        frameloop={visible ? 'always' : 'never'}
      >
        <Rig>
          <Mercury detail={detail} />
          <Orbits />
          <Sparkles count={70} scale={[10, 6, 4]} size={1.6} speed={0.25} color="#e9edf2" opacity={0.7} />
        </Rig>
      </Canvas>
    </div>
  );
}
