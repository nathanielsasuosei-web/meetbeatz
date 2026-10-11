import type * as Three from "three";
import type { BeatEnergy } from "@/lib/beat-energy";

/**
 * The home hero's 3D stage: a "beat orb" — a sphere of glowing rods that push
 * out and light up with the energy of whatever beat is playing, ringed by two
 * gyroscope hoops, sitting in a cloud of dust with a red halo behind it.
 *
 * Everything is built from the palette the rest of the site already uses (ink,
 * deep red, acid, cream), so the canvas reads as part of the hero rather than a
 * widget dropped on top of the photograph. The renderer runs with `alpha: true`,
 * which lets the hero's photo and liquid washes show through the empty space.
 *
 * `createOrbScene` returns null when WebGL is unavailable so the caller can keep
 * the flat hero, and it never throws: a canvas that fails mid-build must not
 * take the store's landing page down with it.
 *
 * three.js is passed in rather than imported here so it can be code-split — the
 * library is only fetched when a hero actually mounts (see hero-stage.tsx).
 */

type ThreeNS = typeof Three;

export type OrbSceneOptions = {
  three: ThreeNS;
  canvas: HTMLCanvasElement;
  /** Element the canvas fills and that supplies pointer/resize events. */
  container: HTMLElement;
  /** "low" halves the rod count on small screens / weak devices. */
  quality: "low" | "high";
  /** Draws one calm frame instead of starting an animation loop. */
  reducedMotion: boolean;
  readEnergy: (elapsed: number, dt: number) => BeatEnergy;
};

export type OrbScene = { dispose: () => void };

/** Sphere the rods stand on. */
const SPHERE_RADIUS = 1.25;
/** Rod length with no music playing, and the extra length at full energy.
 *  The rest length is deliberately over a quarter of the sphere radius: rods any
 *  shorter read as a thin ring around a hollow middle, because the ones pointing
 *  at the camera foreshorten to nothing. */
const BAR_REST = 0.32;
const BAR_TRAVEL = 0.46;
/** The hoops sit just outside the rods' full reach; FIT_RADIUS frames all of it. */
const RING_RADII = [2.02, 2.24];
const FIT_RADIUS = 2.45;
const CAMERA_FOV = 42;
const TIP_SIZE = 0.095;
const DUST_SIZE = 0.05;

/**
 * Rods on a Fibonacci sphere — even spacing with no seam or pole pinch. A
 * latitude/longitude layout clumps at the poles, and both artefacts are obvious
 * the moment the orb rotates.
 */
export function fibonacciDirections(three: ThreeNS, count: number): Three.Vector3[] {
  const points: Three.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    points.push(new three.Vector3(Math.cos(theta) * ring, y, Math.sin(theta) * ring));
  }
  return points;
}

/**
 * How hard one rod is driven, 0..1. Rods near the bottom answer the bass, rods
 * near the top answer the hats, and every rod carries a travelling ripple so the
 * sphere moves as a body instead of pulsing flatly in one key.
 */
export function rodHeat(dirY: number, phase: number, energy: BeatEnergy, elapsed: number): number {
  const up = (dirY + 1) / 2;
  const band = energy.mid * 0.32 + (1 - up) * energy.bass * 0.85 + up * energy.treble * 0.85;
  const ripple = 0.32 + 0.95 * (0.6 + 0.4 * Math.sin(elapsed * 2.3 + phase + dirY * 2.2));
  const heat = band * ripple * (0.6 + 0.65 * energy.level);
  return heat < 0 ? 0 : heat > 1 ? 1 : heat;
}

export function rodLength(heat: number): number {
  return BAR_REST + BAR_TRAVEL * (heat < 0 ? 0 : heat > 1 ? 1 : heat);
}

/**
 * Heat → colour: a quiet rod is deep red, a driven one burns up through amber
 * into acid green. Interpolated in HSL rather than RGB because a straight
 * red→acid mix spends its whole middle in a muddy brown.
 */
export function rodColor(target: Three.Color, heat: number): Three.Color {
  const t = heat < 0 ? 0 : heat > 1 ? 1 : heat;
  const ramp = Math.pow(t, 1.6);
  const hue = (0.982 + ramp * 0.235) % 1; // 355° red → 45° amber → 78° acid
  return target.setHSL(hue, 0.78 + t * 0.16, 0.26 + Math.pow(t, 1.25) * 0.26);
}

/** Soft round particle/pip sprite, drawn once and shared by tips, dust and halo. */
function dotTexture(three: ThreeNS, size: number): Three.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.28, "rgba(255,255,255,0.5)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  return texture;
}

/**
 * A tiny equirectangular "studio": a deep red room with an acid key light on the
 * left, a red rim light on the right and a warm floor. It is the scene
 * environment, so the metal hoops and rods have something on-brand to reflect —
 * far cheaper than shipping an HDR file, and it keeps the palette exact.
 */
function makeEnvironment(three: ThreeNS, renderer: Three.WebGLRenderer): Three.Texture | null {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#2a060e");
  sky.addColorStop(0.55, "#5c0c18");
  sky.addColorStop(1, "#160307");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const blob = (x: number, y: number, radius: number, stops: [number, string][]) => {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    for (const [at, color] of stops) glow.addColorStop(at, color);
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  blob(120, 70, 130, [
    [0, "rgba(198,241,53,0.95)"],
    [1, "rgba(198,241,53,0)"],
  ]);
  blob(392, 110, 150, [
    [0, "rgba(255,86,70,0.85)"],
    [1, "rgba(255,86,70,0)"],
  ]);
  blob(256, 236, 180, [
    [0, "rgba(255,241,208,0.55)"],
    [1, "rgba(255,241,208,0)"],
  ]);

  const texture = new three.CanvasTexture(canvas);
  texture.mapping = three.EquirectangularReflectionMapping;
  texture.colorSpace = three.SRGBColorSpace;

  const pmrem = new three.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(texture).texture;
  pmrem.dispose();
  texture.dispose();
  return environment;
}

export function createOrbScene(options: OrbSceneOptions): OrbScene | null {
  const { three, canvas, container, quality, reducedMotion, readEnergy } = options;
  const low = quality === "low";
  const barCount = low ? 460 : 900;
  const dustCount = low ? 240 : 620;
  const barThickness = low ? 0.045 : 0.032;
  const tipSize = low ? TIP_SIZE * 1.26 : TIP_SIZE;

  let renderer: Three.WebGLRenderer;
  try {
    renderer = new three.WebGLRenderer({ canvas, alpha: true, antialias: !low, powerPreference: "high-performance" });
  } catch (error) {
    console.warn("[hero-orb] WebGL unavailable — keeping the flat hero.", error);
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.5 : 1.85));
  renderer.outputColorSpace = three.SRGBColorSpace;
  renderer.setClearAlpha(0);

  const scene = new three.Scene();
  const camera = new three.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 60);

  // --- Light / environment ---------------------------------------------------
  scene.environment = makeEnvironment(three, renderer);
  scene.add(new three.AmbientLight(0xff7a66, 0.55));
  const key = new three.DirectionalLight(0xfff1d8, 1.15);
  key.position.set(-2.6, 3.4, 2.8);
  scene.add(key);
  const acidLight = new three.PointLight(0xc6f135, 26, 0, 2);
  acidLight.position.set(3.6, 1.4, 2.6);
  scene.add(acidLight);
  const redLight = new three.PointLight(0xff3040, 30, 0, 2);
  redLight.position.set(-3.4, -2.6, -1.8);
  scene.add(redLight);

  // --- The orb ---------------------------------------------------------------
  const orb = new three.Group();
  scene.add(orb);

  const directions = fibonacciDirections(three, barCount);
  const phases = directions.map((_, i) => (i % 17) * 0.37 + Math.sin(i * 12.9898) * 2.4);

  // Pivot at the base, so each rod is placed straight onto the sphere surface
  // and its height is exactly the length it is driven to.
  const rodGeometry = new three.CylinderGeometry(1, 1, 1, 5, 1, false);
  rodGeometry.translate(0, 0.5, 0);
  const rodMaterial = new three.MeshStandardMaterial({
    metalness: 0.45,
    roughness: 0.42,
    envMapIntensity: 1.1,
    emissive: 0x2a0509,
    emissiveIntensity: 0.85,
  });
  const rods = new three.InstancedMesh(rodGeometry, rodMaterial, barCount);
  rods.frustumCulled = false;
  orb.add(rods);

  const coreGeometry = new three.SphereGeometry(SPHERE_RADIUS * 0.98, 32, 24);
  const coreMaterial = new three.MeshStandardMaterial({
    color: 0x1b0509,
    metalness: 0.6,
    roughness: 0.38,
    envMapIntensity: 1.2,
    emissive: 0x5c0a12,
    emissiveIntensity: 0.5,
  });
  orb.add(new three.Mesh(coreGeometry, coreMaterial));

  // Additive fresnel shell — the neon edge that makes the sphere read as glass.
  const rimGeometry = new three.SphereGeometry(SPHERE_RADIUS * 1.06, 32, 24);
  const rimMaterial = new three.ShaderMaterial({
    uniforms: {
      uColorA: { value: new three.Color(0xc6f135) },
      uColorB: { value: new three.Color(0xff3350) },
      uIntensity: { value: 0.9 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float edge = pow(1.0 - abs(dot(vNormal, vView)), 2.6);
        vec3 colour = mix(uColorB, uColorA, edge);
        gl_FragColor = vec4(colour * edge * uIntensity, edge);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: three.AdditiveBlending,
  });
  orb.add(new three.Mesh(rimGeometry, rimMaterial));

  // Glowing tips, one per rod: unlit additive pips, which is what gives the orb
  // its neon read without a post-processing bloom pass.
  const tipGeometry = new three.BufferGeometry();
  const tipPositions = new Float32Array(barCount * 3);
  const tipColors = new Float32Array(barCount * 3);
  tipGeometry.setAttribute("position", new three.BufferAttribute(tipPositions, 3));
  tipGeometry.setAttribute("color", new three.BufferAttribute(tipColors, 3));
  const pipTexture = dotTexture(three, 64);
  const tipMaterial = new three.PointsMaterial({
    size: tipSize,
    map: pipTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: three.AdditiveBlending,
    sizeAttenuation: true,
  });
  const tips = new three.Points(tipGeometry, tipMaterial);
  tips.frustumCulled = false;
  orb.add(tips);

  // --- Gyroscope hoops -------------------------------------------------------
  const ringMaterial = new three.MeshStandardMaterial({
    color: 0xf4f1ea,
    metalness: 0.95,
    roughness: 0.22,
    envMapIntensity: 1.5,
    emissive: 0x3a0b12,
    emissiveIntensity: 0.6,
  });
  const rings = RING_RADII.map((radius, index) => {
    const mesh = new three.Mesh(new three.TorusGeometry(radius, 0.012, 6, 190), ringMaterial);
    mesh.rotation.set(index === 0 ? 0.42 : -0.58, 0, index === 0 ? 0.22 : -0.34);
    orb.add(mesh);
    return mesh;
  });

  // --- Dust ------------------------------------------------------------------
  const dustGeometry = new three.BufferGeometry();
  {
    const positions = new Float32Array(dustCount * 3);
    const colors = new Float32Array(dustCount * 3);
    const ink = new three.Color(0x120206);
    const cream = new three.Color(0xf4f1ea);
    const ember = new three.Color(0xff5c3c);
    const tint = new three.Color();
    for (let i = 0; i < dustCount; i++) {
      const radius = 2.5 + Math.random() * 2.3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi) * 0.75;
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      tint.copy(Math.random() < 0.5 ? cream : ember).lerp(ink, Math.random() * 0.5);
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    dustGeometry.setAttribute("position", new three.BufferAttribute(positions, 3));
    dustGeometry.setAttribute("color", new three.BufferAttribute(colors, 3));
  }
  const dustMaterial = new three.PointsMaterial({
    size: low ? DUST_SIZE * 1.35 : DUST_SIZE,
    map: pipTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: three.AdditiveBlending,
    sizeAttenuation: true,
  });
  const dust = new three.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  // --- Halo and kick shockwave ----------------------------------------------
  const coreEmissiveRest = new three.Color(0x6b0f18);
  const coreEmissiveHot = new three.Color(0xc6f135);

  const haloTexture = dotTexture(three, 128);
  const halo = new three.Sprite(
    new three.SpriteMaterial({
      map: haloTexture,
      color: 0xff2432,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: three.AdditiveBlending,
    }),
  );
  halo.scale.set(4.6, 4.6, 1);
  halo.position.z = -1.6;
  scene.add(halo);

  const innerHalo = new three.Sprite(
    new three.SpriteMaterial({
      map: haloTexture,
      color: 0xc6f135,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: three.AdditiveBlending,
    }),
  );
  innerHalo.scale.set(2.5, 2.5, 1);
  innerHalo.position.z = -1.1;
  scene.add(innerHalo);

  const shockMaterial = new three.MeshBasicMaterial({
    color: 0xc6f135,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: three.AdditiveBlending,
    side: three.DoubleSide,
  });
  const shockwave = new three.Mesh(new three.RingGeometry(1, 1.012, 96), shockMaterial);
  shockwave.visible = false;
  scene.add(shockwave);

  // --- Sizing ----------------------------------------------------------------
  let baseZ = 7;
  const fitCamera = () => {
    const width = container.clientWidth || container.offsetWidth || 320;
    const height = container.clientHeight || container.offsetHeight || 320;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    camera.aspect = aspect;
    const halfFov = three.MathUtils.degToRad(CAMERA_FOV) / 2;
    // Fit FIT_RADIUS into whichever of the two axes is tighter.
    baseZ = (FIT_RADIUS * 1.06) / (Math.tan(halfFov) * Math.min(1, aspect));
    camera.position.z = baseZ;
    camera.updateProjectionMatrix();
  };
  fitCamera();

  // --- Interaction -----------------------------------------------------------
  let pointerX = 0;
  let pointerY = 0;
  let swayX = 0;
  let swayY = 0;
  let impulse = 0;

  const onPointerMove = (event: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointerX = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    pointerY = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
  };
  const onPointerDown = () => {
    impulse += 0.75;
  };
  const resetPointer = () => {
    pointerX = 0;
    pointerY = 0;
  };

  // --- Frame -----------------------------------------------------------------
  const timer = new three.Timer();
  const dummy = new three.Object3D();
  const up = new three.Vector3(0, 1, 0);
  const barColour = new three.Color();
  const tipColour = new three.Color();
  const white = new three.Color(0xffffff);
  let elapsed = 0;
  let spin = 0;
  let shock = 1;
  let previousBass = 0;
  let frame = 0;

  const update = (dt: number) => {
    elapsed += dt;
    frame++;
    const energy = readEnergy(elapsed, dt);
    const tintRods = frame % 2 === 1; // repaint instance colours every other frame

    spin += dt * (0.16 + energy.level * 0.55 + impulse);
    impulse *= Math.exp(-dt / 0.8);
    const ease = Math.min(1, dt * 4);
    swayX += (pointerX * 0.34 - swayX) * ease;
    swayY += (-pointerY * 0.26 - swayY) * ease;

    orb.rotation.set(
      -0.1 + swayY + Math.sin(elapsed * 0.21) * 0.06,
      spin + swayX,
      Math.sin(elapsed * 0.17) * 0.05,
    );
    orb.position.y = Math.sin(elapsed * 0.55) * 0.07;
    orb.scale.setScalar(1 + energy.level * 0.045);

    for (let i = 0; i < barCount; i++) {
      const dir = directions[i];
      const heat = rodHeat(dir.y, phases[i], energy, elapsed);
      const length = rodLength(heat);

      dummy.position.copy(dir).multiplyScalar(SPHERE_RADIUS);
      dummy.quaternion.setFromUnitVectors(up, dir);
      dummy.scale.set(barThickness, length, barThickness);
      dummy.updateMatrix();
      rods.setMatrixAt(i, dummy.matrix);

      rodColor(barColour, heat);
      if (tintRods) rods.setColorAt(i, barColour);

      const reach = SPHERE_RADIUS + length + 0.02;
      tipPositions[i * 3] = dir.x * reach;
      tipPositions[i * 3 + 1] = dir.y * reach;
      tipPositions[i * 3 + 2] = dir.z * reach;

      // Tips are additive, so they get pushed past their own colour for the
      // cherry-on-top glow at the end of a driven rod.
      tipColour.copy(barColour).lerp(white, 0.12 + heat * 0.26).multiplyScalar(0.24 + heat * 0.62);
      tipColors[i * 3] = tipColour.r;
      tipColors[i * 3 + 1] = tipColour.g;
      tipColors[i * 3 + 2] = tipColour.b;
    }
    rods.instanceMatrix.needsUpdate = true;
    if (rods.instanceColor) rods.instanceColor.needsUpdate = tintRods;
    tipGeometry.attributes.position.needsUpdate = true;
    tipGeometry.attributes.color.needsUpdate = true;

    rings.forEach((ring, index) => {
      const speed = index === 0 ? 0.22 : -0.16;
      ring.rotation.z += dt * speed;
      ring.rotation.y += dt * speed * 0.6;
    });

    dust.rotation.y += dt * 0.03;
    dust.rotation.x = Math.sin(elapsed * 0.2) * 0.06;
    dustMaterial.opacity = 0.45 + energy.level * 0.4;

    halo.material.opacity = 0.22 + energy.level * 0.4;
    halo.scale.set(4.4 + energy.level * 0.9, 4.4 + energy.level * 0.9, 1);
    innerHalo.material.opacity = 0.1 + energy.level * 0.24;
    coreMaterial.emissiveIntensity = 0.45 + energy.level * 1.05;
    coreMaterial.emissive.copy(coreEmissiveRest).lerp(coreEmissiveHot, Math.min(1, energy.level * 1.2));
    rimMaterial.uniforms.uIntensity.value = 0.6 + energy.level * 1.1;
    tipMaterial.size = tipSize * (1 + energy.level * 0.35);

    // A kick crossing the threshold throws one ring out across the stage.
    if (energy.bass > 0.72 && previousBass <= 0.72 && shock >= 1) shock = 0;
    previousBass = energy.bass;
    if (shock < 1) {
      shock = Math.min(1, shock + dt * 1.4);
      const scale = 1.4 + shock * 1.6;
      shockwave.visible = true;
      shockwave.scale.set(scale, scale, 1);
      shockMaterial.opacity = (1 - shock) * 0.35;
    } else {
      shockwave.visible = false;
    }

    camera.position.x += (pointerX * 0.42 - camera.position.x) * ease;
    camera.position.y += (-pointerY * 0.36 - camera.position.y) * ease;
    camera.position.z = baseZ - energy.level * 0.18;
    camera.lookAt(0, 0, 0);
  };

  const tick = () => {
    timer.update();
    update(Math.min(timer.getDelta(), 0.05));
    renderer.render(scene, camera);
  };

  // --- Run / pause -----------------------------------------------------------
  // The loop is torn down when the tab is hidden or the hero scrolls away: the
  // canvas is decorative and has no business burning a phone battery off screen.
  let onScreen = true;
  const sync = () => {
    const shouldRun = !reducedMotion && onScreen && !document.hidden;
    renderer.setAnimationLoop(shouldRun ? tick : null);
  };

  const resizeObserver = new ResizeObserver(() => {
    fitCamera();
    if (reducedMotion) renderer.render(scene, camera);
  });
  const intersectionObserver = new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting);
    sync();
  });

  if (reducedMotion) {
    for (let i = 0; i < 60; i++) update(1 / 60); // settle the pose before the single draw
    renderer.render(scene, camera);
    resizeObserver.observe(container);
  } else {
    // Timer + the Page Visibility API: a tab that was hidden for a minute must
    // not hand the next frame a 60-second delta.
    timer.connect(document);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("blur", resetPointer);
    canvas.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("visibilitychange", sync);
    resizeObserver.observe(container);
    intersectionObserver.observe(container);
    update(1 / 60);
    renderer.render(scene, camera);
    sync();
  }

  return {
    dispose() {
      renderer.setAnimationLoop(null);
      timer.disconnect();
      timer.dispose();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", resetPointer);
      canvas.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("visibilitychange", sync);

      scene.traverse((object) => {
        const node = object as Partial<Three.Mesh> & { material?: Three.Material | Three.Material[] };
        node.geometry?.dispose();
        const material = node.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose();
      });
      scene.environment?.dispose();
      pipTexture.dispose();
      haloTexture.dispose();
      renderer.dispose();
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
