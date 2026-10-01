'use client';

import { Environment, Float, Lightformer, PerformanceMonitor, Sparkles } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

const GOLD = new THREE.Color('#f3c97a');
const VIOLET = new THREE.Color('#7b61ff');
const CYAN = new THREE.Color('#4fd9ff');

/** Pointer + scroll, smoothed, shared by everything in the scene. */
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

/** The aurora painted behind the lens. Shared: the backplate shows it, the glass refracts it. */
const PLATE = { z: -2.6, radius: 3.4, angle: 0 };

function makeAuroraTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#04050a';
  g.fillRect(0, 0, 1024, 1024);
  const blob = (x: number, y: number, r: number, color: string) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(4,5,10,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 1024);
  };
  blob(380, 420, 300, 'rgba(110, 80, 255, 0.95)');
  blob(660, 600, 260, 'rgba(70, 210, 255, 0.75)');
  blob(560, 330, 200, 'rgba(255, 196, 107, 0.9)');
  blob(470, 720, 220, 'rgba(255, 120, 170, 0.4)');
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(255, 236, 200, 0.6)';
  g.lineWidth = 6;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc(512, 512, 100 + i * 52, -0.9 + i * 0.5, 0.2 + i * 0.6);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const GLASS_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const GLASS_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uAngle;
uniform float uPlaneZ;
uniform float uRadius;
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;

vec2 plateUV(vec3 p, vec3 d) {
  float t = (uPlaneZ - p.z) / min(d.z, -0.05);
  vec3 h = p + d * t;
  float c = cos(-uAngle), s = sin(-uAngle);
  vec2 q = vec2(c * h.x - s * h.y, s * h.x + c * h.y);
  return q / (2.0 * uRadius) + 0.5;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vWorld - cameraPosition);
  if (dot(N, V) > 0.0) N = -N;
  float facing = max(dot(-V, N), 0.0);
  float fres = pow(1.0 - facing, 3.0);

  // Chromatic refraction into the aurora plate behind.
  vec3 col;
  col.r = texture2D(uMap, plateUV(vWorld, refract(V, N, 1.0 / 1.28))).r;
  col.g = texture2D(uMap, plateUV(vWorld, refract(V, N, 1.0 / 1.34))).g;
  col.b = texture2D(uMap, plateUV(vWorld, refract(V, N, 1.0 / 1.40))).b;
  col = col * 2.1 + vec3(0.03, 0.02, 0.07);

  // Reflection: a soft violet-to-pearl sky plus two sharp highlights.
  vec3 R = reflect(V, N);
  vec3 env = mix(vec3(0.04, 0.03, 0.10), vec3(0.78, 0.70, 1.0), smoothstep(-0.3, 0.9, R.y));
  env += vec3(1.0, 0.84, 0.58) * pow(max(dot(R, normalize(vec3(0.55, 0.7, 0.45))), 0.0), 80.0) * 3.0;
  env += vec3(0.55, 0.92, 1.0) * pow(max(dot(R, normalize(vec3(-0.7, -0.25, 0.6))), 0.0), 36.0) * 1.4;

  // Thin-film iridescence toward the rim.
  vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + fres * 1.6 + uTime * 0.04));

  col = mix(col, env, clamp(fres * 0.9, 0.0, 1.0));
  col += film * fres * 0.4;
  col += vec3(0.95, 0.85, 1.0) * pow(fres, 5.0) * 0.8;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** Cheap smooth 3D noise (sum of sines), good enough for a breathing liquid surface. */
function wobble(x: number, y: number, z: number, t: number) {
  return (
    Math.sin(x * 1.9 + t * 0.9) * Math.cos(y * 1.6 - t * 0.7) * 0.5 +
    Math.sin(y * 2.3 + z * 1.4 + t * 1.1) * 0.3 +
    Math.cos(z * 2.1 - x * 1.2 + t * 0.6) * 0.2
  );
}

/** A liquid-glass lens that ripples in real time, with a molten core inside. */
function Lens({ quality, map }: { quality: number; map: THREE.Texture }) {
  const ref = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.ShaderMaterial>(null);
  const glow = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(255,220,160,0.9)');
    grad.addColorStop(0.45, 'rgba(255,170,80,0.35)');
    grad.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);
  const uniforms = useMemo(
    () => ({ uMap: { value: map }, uAngle: { value: 0 }, uPlaneZ: { value: PLATE.z }, uRadius: { value: PLATE.radius }, uTime: { value: 0 } }),
    [map],
  );
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1.0, quality > 0.7 ? 14 : 8), [quality]);
  const base = useMemo(() => Float32Array.from(geo.attributes.position!.array as Float32Array), [geo]);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i]!, y = base[i + 1]!, z = base[i + 2]!;
      const k = 1 + wobble(x, y, z, t) * 0.085;
      arr[i] = x * k;
      arr[i + 1] = y * k;
      arr[i + 2] = z * k;
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    if (ref.current) {
      ref.current.rotation.y += dt * 0.12;
      ref.current.rotation.z = Math.sin(t * 0.25) * 0.15;
    }
    if (core.current) core.current.scale.setScalar(1.1 + Math.sin(t * 1.4) * 0.08);
    if (mat.current) {
      mat.current.uniforms.uAngle!.value = PLATE.angle;
      mat.current.uniforms.uTime!.value = t;
    }
  });
  return (
    <group>
      <sprite ref={core as unknown as React.RefObject<THREE.Sprite>} renderOrder={2}>
        <spriteMaterial map={glow} color="#ffc070" toneMapped={false} transparent blending={THREE.AdditiveBlending} depthTest={false} depthWrite={false} />
      </sprite>
      <mesh ref={ref} geometry={geo}>
        <shaderMaterial ref={mat} vertexShader={GLASS_VERT} fragmentShader={GLASS_FRAG} uniforms={uniforms} />
      </mesh>
    </group>
  );
}

/** Three iridescent orbits, each with a glass bead riding it. */
function Orbits() {
  const rings = useMemo(
    () => [
      { r: 1.62, tilt: [1.2, 0.2, 0] as const, speed: 0.22, color: GOLD },
      { r: 1.95, tilt: [0.5, -0.6, 0.3] as const, speed: -0.16, color: VIOLET },
      { r: 2.28, tilt: [1.9, 0.9, -0.2] as const, speed: 0.11, color: CYAN },
    ],
    [],
  );
  const groups = useRef<(THREE.Group | null)[]>([]);
  const beads = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    rings.forEach((r, i) => {
      const g = groups.current[i];
      if (g) g.rotation.z += dt * r.speed;
      const b = beads.current[i];
      if (b) {
        const a = t * (0.6 + i * 0.15) + i * 2;
        b.position.set(Math.cos(a) * r.r, Math.sin(a) * r.r, 0);
      }
    });
  });
  return (
    <>
      {rings.map((r, i) => (
        <group key={i} rotation={r.tilt as unknown as THREE.Euler}>
          <group ref={(el) => (groups.current[i] = el)}>
            <mesh>
              <torusGeometry args={[r.r, 0.011, 16, 220]} />
              <meshPhysicalMaterial
                color={r.color}
                emissive={r.color}
                emissiveIntensity={0.9}
                metalness={1}
                roughness={0.15}
                iridescence={1}
                iridescenceIOR={1.6}
                toneMapped={false}
              />
            </mesh>
            <mesh ref={(el) => (beads.current[i] = el)}>
              <sphereGeometry args={[0.13 + i * 0.03, 32, 32]} />
              <meshPhysicalMaterial color="#f6f0ff" metalness={0.25} roughness={0.08} iridescence={1} iridescenceIOR={1.4} clearcoat={1} envMapIntensity={1.6} />
            </mesh>
          </group>
        </group>
      ))}
    </>
  );
}

/** The aurora plate itself, slowly turning. Visible around the lens; refracted through it. */
function Backplate({ map }: { map: THREE.Texture }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    PLATE.angle += dt * 0.05;
    if (ref.current) ref.current.rotation.z = PLATE.angle;
  });
  return (
    <mesh ref={ref} position={[0, 0, PLATE.z]}>
      <circleGeometry args={[PLATE.radius, 96]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  );
}

/** Pointer parallax and scroll drift for the whole sculpture. */
function Rig({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, input.x * 0.35, 0.05);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, -input.y * 0.25 + input.scroll * 0.6, 0.05);
    g.position.y = THREE.MathUtils.lerp(g.position.y, input.scroll * 1.6, 0.08);
    const s = THREE.MathUtils.lerp(g.scale.x, 1 - Math.min(input.scroll, 1) * 0.25, 0.08);
    g.scale.setScalar(s);
  });
  return <group ref={ref}>{children}</group>;
}

export default function HeroScene() {
  useInputs();
  const aurora = useMemo(() => makeAuroraTexture(), []);
  const [quality, setQuality] = useState(1);
  const [visible, setVisible] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { rootMargin: '100px' });
    if (host.current) io.observe(host.current);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={host} className="hero-canvas">
      <div className="hero-glow" aria-hidden />
      <Canvas
        dpr={[1, quality > 0.7 ? 1.75 : 1.2]}
        camera={{ position: [0, 0, 7.4], fov: 32 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        frameloop={visible ? 'always' : 'never'}
      >
        <PerformanceMonitor onDecline={() => setQuality(0.5)} onIncline={() => setQuality(1)} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[3, 4, 5]} intensity={2} color="#fff4e0" />
        <pointLight position={[-4, -2, 3]} intensity={30} color="#7b61ff" />
        <Backplate map={aurora} />
        <Rig>
          <Float speed={1.4} rotationIntensity={0.25} floatIntensity={0.6}>
            <Lens quality={quality} map={aurora} />
            <Orbits />
          </Float>
          <Sparkles count={quality > 0.7 ? 90 : 40} scale={[9, 6, 4]} size={2.2} speed={0.35} color="#ffe2b0" opacity={0.8} />
        </Rig>
        <Environment resolution={256} frames={1}>
          <group rotation={[-Math.PI / 3, 0, 1]}>
            <Lightformer form="circle" intensity={4} rotation-x={Math.PI / 2} position={[0, 5, -9]} scale={2} />
            <Lightformer form="ring" color="#9b8cff" intensity={8} position={[-5, 1, -1]} scale={4} />
            <Lightformer form="rect" color="#63e6ff" intensity={4} position={[5, 1, -1]} scale={[10, 3, 1]} />
            <Lightformer form="rect" color="#f3c97a" intensity={5} position={[0, -4, 2]} scale={[8, 2, 1]} />
            <Lightformer form="circle" color="#ffffff" intensity={2} position={[0, 0, 8]} scale={3} />
          </group>
        </Environment>
      </Canvas>
    </div>
  );
}
