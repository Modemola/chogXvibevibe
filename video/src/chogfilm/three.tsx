import { ThreeCanvas } from '@remotion/three';
import { useEffect, useMemo, useState } from 'react';
import { continueRender, delayRender, staticFile, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { CHOGS, type ChogArt, rng } from './kit';

/** Loads every Chog as a texture before the frame renders. */
function useChogTextures(list: ChogArt[]) {
  const [handle] = useState(() => delayRender('chog textures'));
  const [tex, setTex] = useState<THREE.Texture[] | null>(null);
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    Promise.all(
      list.map(
        (c) =>
          new Promise<THREE.Texture>((res) =>
            loader.load(staticFile(c.file), (t) => {
              t.colorSpace = THREE.SRGBColorSpace;
              t.anisotropy = 4;
              res(t);
            }),
          ),
      ),
    ).then((t) => {
      setTex(t);
      continueRender(handle);
    });
  }, [handle, list]);
  return tex;
}

/** Rounded-rectangle shape for card bodies. */
function rounded(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

function Card({ tex, body, face, position, rotation, scale = 1 }: { tex: THREE.Texture; body: THREE.BufferGeometry; face: THREE.BufferGeometry; position: [number, number, number]; rotation: [number, number, number]; scale?: number }) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh geometry={body}>
        <meshStandardMaterial color="#ffffff" roughness={0.35} metalness={0.05} />
      </mesh>
      <mesh geometry={face} position={[0, 0.06, 0.072]}>
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.28} roughness={0.32} metalness={0} />
      </mesh>
      <mesh geometry={face} position={[0, 0.06, -0.072]} rotation={[0, Math.PI, 0]}>
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.28} roughness={0.32} metalness={0} />
      </mesh>
    </group>
  );
}

function useCardGeometry() {
  return useMemo(() => {
    const body = new THREE.ExtrudeGeometry(rounded(1.1, 1.32, 0.12), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 3, curveSegments: 10 });
    body.translate(0, 0, -0.05);
    const face = new THREE.ShapeGeometry(rounded(0.96, 0.96, 0.09), 10);
    // Map UVs of the face to 0..1.
    const pos = face.attributes.position!;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / 0.96 + 0.5;
      uv[i * 2 + 1] = pos.getY(i) / 0.96 + 0.5;
    }
    face.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return { body, face };
  }, []);
}

function Lights() {
  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} />
      <directionalLight position={[-4, 1, 2]} intensity={0.9} color="#ff8fd0" />
      <directionalLight position={[0, -3, -4]} intensity={1.2} color="#8fd3ff" />
    </>
  );
}

/** A ring of Chog cards orbiting the camera, each spinning a little on its own. */
export function Carousel({ t, spin, lift = 0, list = CHOGS }: { t: number; spin: number; lift?: number; list?: ChogArt[] }) {
  const { width, height } = useVideoConfig();
  const tex = useChogTextures(list);
  const { body, face } = useCardGeometry();
  if (!tex) return null;
  const n = list.length;
  const R = 3.3;
  return (
    <ThreeCanvas width={width} height={height} style={{ position: 'absolute', inset: 0 }} camera={{ position: [0, 0.9, 7.4], fov: 38 }} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}>
      <Lights />
      {list.map((c, i) => {
        const a = spin + (i / n) * Math.PI * 2;
        const x = Math.sin(a) * R;
        const z = Math.cos(a) * R - 1.2;
        const y = Math.sin(t * 2.2 + i) * 0.12 + lift;
        return <Card key={c.token} tex={tex[i]!} body={body} face={face} position={[x, y, z]} rotation={[0.05, a + Math.sin(t * 1.5 + i) * 0.35, Math.sin(t * 1.8 + i) * 0.06]} />;
      })}
    </ThreeCanvas>
  );
}

/** One big hero card that flips and floats. */
export function HeroCard({ c, t, rotY, scale = 1, x = 0, y = 0 }: { c: ChogArt; t: number; rotY: number; scale?: number; x?: number; y?: number }) {
  const { width, height } = useVideoConfig();
  const list = useMemo(() => [c], [c]);
  const tex = useChogTextures(list);
  const { body, face } = useCardGeometry();
  if (!tex) return null;
  return (
    <ThreeCanvas width={width} height={height} style={{ position: 'absolute', inset: 0 }} camera={{ position: [0, 0, 6], fov: 36 }} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}>
      <Lights />
      <Card tex={tex[0]!} body={body} face={face} position={[x, y + Math.sin(t * 2) * 0.06, 0]} rotation={[Math.sin(t * 1.3) * 0.08, rotY, Math.sin(t * 1.7) * 0.04]} scale={scale} />
    </ThreeCanvas>
  );
}

const rc = rng(9);
const COINS = Array.from({ length: 90 }, () => ({ x: (rc() - 0.5) * 11, z: (rc() - 0.5) * 3, d: rc() * 2.4, sp: 3.2 + rc() * 2.2, rx: rc() * 6, rz: rc() * 6, w: 2 + rc() * 4 }));

/** 3D gold coins raining from `start` for `dur` seconds; `targetY` is where they land and pile. */
export function CoinRain({ t, start, dur, density = 1 }: { t: number; start: number; dur: number; density?: number }) {
  const { width, height } = useVideoConfig();
  const geo = useMemo(() => new THREE.CylinderGeometry(0.22, 0.22, 0.045, 32), []);
  const n = Math.round(COINS.length * density);
  return (
    <ThreeCanvas width={width} height={height} style={{ position: 'absolute', inset: 0 }} camera={{ position: [0, 0, 8], fov: 40 }} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}>
      <ambientLight intensity={1.0} />
      <directionalLight position={[2, 5, 6]} intensity={2.6} />
      <directionalLight position={[-3, -1, 3]} intensity={1.0} color="#ff8fd0" />
      {COINS.slice(0, n).map((c, i) => {
        const age = t - start - c.d;
        if (age < 0 || t > start + dur + 1.6) return null;
        const y = 4.4 - age * c.sp;
        if (y < -4.6) return null;
        return (
          <mesh key={i} geometry={geo} position={[c.x, y, c.z]} rotation={[c.rx + age * c.w, 0, c.rz + age * c.w * 0.6]}>
            <meshStandardMaterial color="#ffcf3a" metalness={0.85} roughness={0.22} emissive="#5a3a00" emissiveIntensity={0.25} />
          </mesh>
        );
      })}
    </ThreeCanvas>
  );
}
