import { ThreeCanvas } from '@remotion/three';
import { useMemo } from 'react';
import { useVideoConfig } from 'remotion';
import * as THREE from 'three';

/**
 * The website's mercury orb (apps/web/components/three/HeroScene.tsx), driven by time
 * instead of a render loop so every frame is deterministic. The surface ripples in the
 * vertex shader; the fragment shader reflects a procedural photo studio.
 */
const VERT = /* glsl */ `
uniform float uTime;
uniform float uWobble;
varying vec3 vWorld;
varying vec3 vNormal;
float wobble(vec3 p) {
  float t = uTime;
  return sin(p.x * 1.7 + t * 0.7) * cos(p.y * 1.5 - t * 0.55) * 0.5
       + sin(p.y * 2.1 + p.z * 1.3 + t * 0.9) * 0.3
       + cos(p.z * 1.9 - p.x * 1.1 + t * 0.5) * 0.2;
}
vec3 displace(vec3 p) { return p * (1.0 + wobble(p) * uWobble); }
void main() {
  float radius = length(position);
  vec3 n = position / radius;
  vec3 tangent = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 bitangent = cross(n, tangent);
  float e = 0.01;
  vec3 p0 = displace(position);
  vec3 p1 = displace(normalize(n + tangent * e) * radius);
  vec3 p2 = displace(normalize(n + bitangent * e) * radius);
  vec3 normalObj = normalize(cross(p1 - p0, p2 - p0));
  vec4 w = modelMatrix * vec4(p0, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normalObj);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uYaw;
uniform float uPitch;
uniform float uAlpha;
uniform float uLight;
varying vec3 vWorld;
varying vec3 vNormal;
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c*v.x + s*v.z, v.y, -s*v.x + c*v.z); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c*v.y - s*v.z, s*v.y + c*v.z); }
vec3 studio(vec3 r) {
  vec3 c = mix(vec3(0.018, 0.020, 0.024), vec3(0.11, 0.118, 0.13), smoothstep(-0.25, 0.65, r.y));
  float az = atan(r.x, r.z);
  float top = smoothstep(0.80, 0.93, r.y) * smoothstep(1.2, 0.6, abs(az + 0.3));
  c += vec3(1.0) * top * 1.9;
  float band = smoothstep(-0.35, 0.15, r.y) * smoothstep(0.9, 0.55, r.y);
  c += vec3(0.96, 0.98, 1.0) * smoothstep(0.10, 0.02, abs(az - 1.15)) * band * 1.5;
  c += vec3(0.90, 0.93, 0.97) * smoothstep(0.07, 0.012, abs(az + 1.55)) * band * 1.0;
  c += vec3(0.80, 0.84, 0.90) * smoothstep(0.05, 0.008, abs(az - 2.6)) * band * 0.7;
  c += vec3(0.62, 0.67, 0.74) * exp(-abs(r.y + 0.02) * 30.0) * 0.55;
  c += vec3(0.07, 0.075, 0.08) * smoothstep(-0.15, -0.9, r.y);
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
  vec3 col = studio(R) * mix(0.82, 1.25, fres) * uLight;
  col += vec3(0.85, 0.9, 1.0) * fres * 0.12;
  col *= vec3(0.97, 0.985, 1.02);
  gl_FragColor = vec4(col, uAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface Drop {
  /** World position; the visible frame is about 7.7 × 4.36 units at 16:9. */
  x: number;
  y: number;
  r: number;
  wobble?: number;
  opacity?: number;
  light?: number;
  /** Squash/stretch along y (1 = round). */
  stretch?: number;
}

function Mercury({ d, time, detail }: { d: Drop; time: number; detail: number }) {
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, detail), [detail]);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uWobble: { value: 0.07 }, uYaw: { value: 0 }, uPitch: { value: 0 }, uAlpha: { value: 1 }, uLight: { value: 1 } }),
    [],
  );
  uniforms.uTime.value = time;
  uniforms.uWobble.value = d.wobble ?? 0.07;
  uniforms.uAlpha.value = d.opacity ?? 1;
  uniforms.uLight.value = d.light ?? 1;
  // The studio drifts slowly, so reflections glide across the metal as on the website.
  uniforms.uYaw.value = Math.sin(time * 0.11) * 0.45;
  uniforms.uPitch.value = Math.sin(time * 0.07 + 1) * 0.15;
  const stretch = d.stretch ?? 1;
  return (
    <mesh geometry={geo} position={[d.x, d.y, 0]} scale={[d.r / Math.sqrt(stretch), d.r * stretch, d.r / Math.sqrt(stretch)]} rotation={[0, time * 0.05, 0]}>
      <shaderMaterial vertexShader={VERT} fragmentShader={FRAG} uniforms={uniforms} transparent={(d.opacity ?? 1) < 1} depthWrite={(d.opacity ?? 1) >= 1} />
    </mesh>
  );
}

/** One or more mercury bodies over a transparent canvas. */
export function Orb({ drops, time, detail = 48 }: { drops: Drop[]; time: number; detail?: number }) {
  const { width, height } = useVideoConfig();
  const visible = drops.filter((d) => (d.opacity ?? 1) > 0.001 && d.r > 0.001);
  if (!visible.length) return null;
  return (
    <ThreeCanvas
      width={width}
      height={height}
      style={{ position: 'absolute', inset: 0 }}
      camera={{ position: [0, 0, 7.6], fov: 32 }}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
    >
      {visible.map((d, i) => (
        <Mercury key={i} d={d} time={time} detail={i === 0 ? detail : 20} />
      ))}
    </ThreeCanvas>
  );
}

/** Pixels per world unit at z = 0 for the film's camera. */
export const unitPx = (height: number) => height / (2 * 7.6 * Math.tan((16 * Math.PI) / 180));
