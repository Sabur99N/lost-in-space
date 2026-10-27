import './style.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

/* ============================================================
   QUALITY / ENVIRONMENT
============================================================ */
const isTouch = window.matchMedia('(hover: none)').matches
const isMobile = window.matchMedia('(max-width: 820px)').matches || /Mobi|Android/i.test(navigator.userAgent)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const QUALITY = {
  dpr: Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2),
  dust: isMobile ? 1200 : 3200,
  stars: isMobile ? 2500 : 6500,
  smaa: !isMobile,
  bloomStrength: isMobile ? 0.34 : 0.52,
}

/* ============================================================
   RENDERER / SCENE / CAMERA
============================================================ */
const canvas = document.querySelector('#webgl')
const scene = new THREE.Scene()

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 2000)
camera.position.set(0, 0, 14)

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(QUALITY.dpr)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.outputColorSpace = THREE.SRGBColorSpace

/* ============================================================
   LOADING MANAGER
============================================================ */
const loaderEl = document.getElementById('loader')
const progressEl = document.getElementById('progress')
const progressNum = document.getElementById('progress-num')
let revealed = false

const manager = new THREE.LoadingManager()
manager.onProgress = (_url, loaded, total) => {
  const pct = Math.round((loaded / total) * 100)
  progressEl.style.width = pct + '%'
  progressNum.textContent = pct
}
manager.onLoad = reveal
manager.onError = () => { setTimeout(reveal, 400) }
// Safety net: never trap the user on the loader.
setTimeout(reveal, 12000)

function reveal() {
  if (revealed) return
  revealed = true
  progressEl.style.width = '100%'
  progressNum.textContent = 100
  loaderEl.classList.add('done')
  document.body.style.overflow = ''
  initScrollNarrative()
  initReveals()
}
document.body.style.overflow = 'hidden'

/* ============================================================
   ENVIRONMENT (HDRI)
============================================================ */
const sunWorldDir = new THREE.Vector3(-6, 2.5, 4).normalize()
const sunViewDir = { value: new THREE.Vector3().copy(sunWorldDir) }

new HDRLoader(manager).load('/hdri/space.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping
  scene.environment = hdr
  scene.background = hdr
  scene.backgroundBlurriness = 0.5
  scene.backgroundIntensity = 0.28
  scene.environmentIntensity = 0.55
})

/* ============================================================
   LIGHTING
============================================================ */
const sun = new THREE.DirectionalLight(0xfff2e0, 2.6)
sun.position.copy(sunWorldDir).multiplyScalar(20)
scene.add(sun)

const rim = new THREE.PointLight(0x2f7bff, 34, 60)
rim.position.set(8, 4, -8)
scene.add(rim)

scene.add(new THREE.AmbientLight(0x223a66, 0.3))
scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x0a0f1e, 0.34))

/* ============================================================
   EARTH — multi-layer with night-side city lights
============================================================ */
const texLoader = new THREE.TextureLoader(manager)
const load = (p, srgb = false) => {
  const t = texLoader.load(p)
  t.anisotropy = renderer.capabilities.getMaxAnisotropy()
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

const earthGroup = new THREE.Group()
const EARTH_R = 5

const earthMat = new THREE.MeshStandardMaterial({
  map: load('/textures/earth/day.jpg', true),
  normalMap: load('/textures/earth/normal.jpg'),
  roughnessMap: load('/textures/earth/specular.jpg'),
  emissiveMap: load('/textures/earth/night.jpg', true),
  emissive: new THREE.Color(0xffcf94),
  emissiveIntensity: 1.3,
  metalness: 0.05,
  roughness: 0.95,
})
earthMat.normalScale.set(0.72, 0.72)

// Inject a day/night mask so city lights only glow on the dark hemisphere.
earthMat.onBeforeCompile = (shader) => {
  shader.uniforms.uSunViewDir = sunViewDir
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uSunViewDir;')
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       float dayAmount = smoothstep(-0.22, 0.32, dot(normalize(normal), normalize(uSunViewDir)));
       totalEmissiveRadiance *= (1.0 - dayAmount);`
    )
}

const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 96, 96), earthMat)
earthGroup.add(earth)

const cloudsMat = new THREE.MeshStandardMaterial({
  map: load('/textures/earth/clouds.jpg'),
  transparent: true,
  opacity: 0.36,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})
const clouds = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R + 0.06, 96, 96), cloudsMat)
earthGroup.add(clouds)

// Fresnel atmosphere glow
const atmosMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(0x4d9dff) } },
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    varying vec3 vNormal;
    uniform vec3 uColor;
    void main() {
      float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.5);
      gl_FragColor = vec4(uColor, 1.0) * intensity;
    }`,
  side: THREE.BackSide,
  blending: THREE.AdditiveBlending,
  transparent: true,
})
const atmos = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R + 0.55, 64, 64), atmosMat)
earthGroup.add(atmos)

earthGroup.position.set(7, -1, -6)
earthGroup.rotation.z = 0.32
scene.add(earthGroup)

/* ============================================================
   ASTRONAUT (meshopt-compressed GLB)
============================================================ */
let mixer
const astroGroup = new THREE.Group()      // scroll transforms live here
const astroFloat = new THREE.Group()       // idle floating lives here
astroGroup.add(astroFloat)
scene.add(astroGroup)

const gltfLoader = new GLTFLoader(manager)
gltfLoader.setMeshoptDecoder(MeshoptDecoder)
gltfLoader.load('/models/astronaut-float.glb', (gltf) => {
  const model = gltf.scene

  model.traverse((o) => {
    if (o.isMesh) {
      o.material.envMapIntensity = 0.85
      if (o.material.roughness !== undefined) o.material.roughness = Math.min(1, (o.material.roughness ?? 0.5) + 0.08)
      o.material.needsUpdate = true
      o.frustumCulled = false
    }
  })

  // Normalise size & recentre so framing is predictable.
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  model.position.sub(center)
  const targetHeight = 3.4
  astroFloat.scale.setScalar(targetHeight / (size.y || 1))
  astroFloat.add(model)

  astroGroup.position.set(-3.4, -1.4, 3)
  astroGroup.rotation.y = 0.4

  if (gltf.animations && gltf.animations.length) {
    mixer = new THREE.AnimationMixer(model)
    gltf.animations.forEach((clip) => mixer.clipAction(clip).play())
  }
})

/* ============================================================
   PARTICLES — distant stars + drifting dust
============================================================ */
function makePoints(count, spread, size, color, opacity) {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * spread
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    size, color, transparent: true, opacity,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  })
  return new THREE.Points(geo, mat)
}

const stars = makePoints(QUALITY.stars, 600, 0.7, 0xbcd4ff, 0.9)
scene.add(stars)
const dust = makePoints(QUALITY.dust, 70, 0.06, 0xffffff, 0.55)
scene.add(dust)

/* ============================================================
   POST-PROCESSING
============================================================ */
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  QUALITY.bloomStrength, 0.4, 0.55
)
composer.addPass(bloomPass)

const PostFX = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grainAmount: { value: 0.055 },
    vignette: { value: 0.42 },
    caAmount: { value: 0.0035 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float grainAmount; uniform float vignette; uniform float caAmount;
    varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 dir = uv - 0.5;
      float d = length(dir);
      float ca = caAmount * d;
      vec3 col;
      col.r = texture2D(tDiffuse, uv - dir * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + dir * ca).b;
      float vig = smoothstep(0.95, 0.35, d);
      col *= mix(1.0, vig, vignette);
      float n = (rand(uv + fract(time)) - 0.5) * grainAmount;
      col += n;
      gl_FragColor = vec4(col, 1.0);
    }`,
}
const postFXPass = new ShaderPass(PostFX)
composer.addPass(postFXPass)

composer.addPass(new OutputPass())

if (QUALITY.smaa) {
  composer.addPass(new SMAAPass())
}

/* ============================================================
   SMOOTH SCROLL (Lenis + GSAP ticker)
============================================================ */
const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, smoothWheel: true })
lenis.on('scroll', (e) => {
  ScrollTrigger.update()
  const bar = document.getElementById('scroll-progress-bar')
  if (bar) bar.style.width = (e.progress * 100).toFixed(2) + '%'
})
gsap.ticker.add((t) => lenis.raf(t * 1000))
gsap.ticker.lagSmoothing(0)

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault()
    const target = document.querySelector(a.getAttribute('href'))
    if (target) lenis.scrollTo(target, { offset: 0, duration: 1.6 })
  })
})

/* ============================================================
   CAMERA CHOREOGRAPHY (decoupled base + mouse parallax)
============================================================ */
const camBase = { x: 0, y: 0, z: 14 }
const lookAt = { x: 0, y: 0, z: 0 }
const mouse = { x: 0, y: 0 }
const _look = new THREE.Vector3()

function initScrollNarrative() {
  if (reducedMotion) return
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: 'main', start: 'top top', end: 'bottom bottom', scrub: 1.2 },
  })

  // hero -> drift
  tl.to(camBase, { x: 2.4, y: 0.6, z: 10 }, 0)
    .to(lookAt, { x: 1.2, y: 0, z: -1 }, 0)
    .to(earthGroup.position, { x: 3.5, y: -0.4, z: -3.5 }, 0)
    .to(earthGroup.rotation, { y: 0.7 }, 0)
    .to(astroGroup.position, { x: -2.4, y: -0.6, z: 2.5 }, 0)

  // drift -> terminator
  tl.to(camBase, { x: -1.8, y: 0.9, z: 9 }, 1)
    .to(lookAt, { x: 2.4, y: 0.2, z: -2 }, 1)
    .to(earthGroup.position, { x: 5.5, y: 0.6, z: -2.5 }, 1)
    .to(earthGroup.rotation, { y: 1.5 }, 1)
    .to(astroGroup.position, { x: 2.6, y: 0.1, z: 1.5 }, 1)
    .to(astroGroup.rotation, { y: 1.4 }, 1)

  // terminator -> vitals
  tl.to(camBase, { x: 0.5, y: 0.2, z: 7.5 }, 2)
    .to(lookAt, { x: -1.4, y: -0.2, z: 0 }, 2)
    .to(earthGroup.position, { x: -6, y: -1, z: -4 }, 2)
    .to(earthGroup.rotation, { y: 2.4 }, 2)
    .to(astroGroup.position, { x: -1.8, y: -0.4, z: 3 }, 2)
    .to(astroGroup.rotation, { y: 2.6 }, 2)

  // vitals -> marble
  tl.to(camBase, { x: 0, y: 0.4, z: 12 }, 3)
    .to(lookAt, { x: 0, y: 0, z: -2 }, 3)
    .to(earthGroup.position, { x: 0, y: -0.5, z: -6 }, 3)
    .to(earthGroup.rotation, { y: 3.1 }, 3)
    .to(earthGroup.scale, { x: 1.25, y: 1.25, z: 1.25 }, 3)
    .to(astroGroup.position, { x: -4.5, y: 1.4, z: 1 }, 3)

  // marble -> log
  tl.to(camBase, { x: -2.2, y: 0.2, z: 8.5 }, 4)
    .to(lookAt, { x: 1.5, y: 0, z: -1 }, 4)
    .to(earthGroup.position, { x: 4.8, y: 1, z: -3 }, 4)
    .to(earthGroup.rotation, { y: 3.9 }, 4)
    .to(earthGroup.scale, { x: 1, y: 1, z: 1 }, 4)
    .to(astroGroup.position, { x: 2.2, y: -0.8, z: 2 }, 4)
    .to(astroGroup.rotation, { y: 3.6 }, 4)

  // log -> silence
  tl.to(camBase, { x: 0, y: 0, z: 13 }, 5)
    .to(lookAt, { x: 0, y: 0, z: 0 }, 5)
    .to(earthGroup.position, { x: 0, y: -8, z: -10 }, 5)
    .to(astroGroup.position, { x: 0, y: -0.3, z: 3.5 }, 5)
    .to(astroGroup.rotation, { y: Math.PI * 2 }, 5)
}

window.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) - 0.5
  mouse.y = (e.clientY / window.innerHeight) - 0.5
})

/* ============================================================
   TEXT REVEALS + COUNTERS
============================================================ */
function initReveals() {
  gsap.utils.toArray('.section').forEach((sec) => {
    gsap.to(sec.querySelectorAll('.reveal'), {
      opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.1,
      scrollTrigger: { trigger: sec, start: 'top 78%' },
    })
  })

  gsap.utils.toArray('[data-count]').forEach((el) => {
    const end = parseFloat(el.dataset.count)
    const suffix = el.dataset.suffix || ''
    const obj = { v: 0 }
    ScrollTrigger.create({
      trigger: el, start: 'top 88%', once: true,
      onEnter: () => gsap.to(obj, {
        v: end, duration: 2, ease: 'power2.out',
        onUpdate: () => { el.textContent = Math.floor(obj.v).toLocaleString() + suffix },
      }),
    })
  })
}

/* ============================================================
   CUSTOM CURSOR
============================================================ */
if (!isTouch) {
  const dot = document.querySelector('.cursor-dot')
  const ring = document.querySelector('.cursor-ring')
  const xToDot = gsap.quickTo(dot, 'x', { duration: 0.15, ease: 'power3' })
  const yToDot = gsap.quickTo(dot, 'y', { duration: 0.15, ease: 'power3' })
  const xToRing = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' })
  const yToRing = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' })
  window.addEventListener('mousemove', (e) => {
    xToDot(e.clientX); yToDot(e.clientY)
    xToRing(e.clientX); yToRing(e.clientY)
  })
  document.querySelectorAll('[data-hover]').forEach((el) => {
    el.addEventListener('mouseenter', () => ring.classList.add('hover'))
    el.addEventListener('mouseleave', () => ring.classList.remove('hover'))
  })
}

/* ============================================================
   HUD TELEMETRY
============================================================ */
const latEl = document.getElementById('lat')
const lonEl = document.getElementById('lon')
const o2El = document.getElementById('o2')
let hudTick = 0
let o2 = 84

/* ============================================================
   REBOOT INTERACTION
============================================================ */
const rebootBtn = document.querySelector('.btn-primary')
if (rebootBtn) {
  rebootBtn.addEventListener('click', () => {
    const signal = document.getElementById('signal')
    signal.textContent = 'SIGNAL ACQUIRED'
    signal.style.color = '#4fffa8'
    gsap.fromTo(bloomPass, { strength: QUALITY.bloomStrength * 2.4 }, { strength: QUALITY.bloomStrength, duration: 1.4, ease: 'power2.out' })
    lenis.scrollTo(0, { duration: 2.2 })
    setTimeout(() => {
      signal.textContent = 'NO SIGNAL DETECTED'
      signal.style.color = ''
    }, 5000)
  })
}

/* ============================================================
   AMBIENT AUDIO (WebAudio drone — no asset needed)
============================================================ */
let audioCtx, masterGain, audioOn = false
const audioBtn = document.getElementById('audio-toggle')
function startAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  masterGain = audioCtx.createGain()
  masterGain.gain.value = 0
  masterGain.connect(audioCtx.destination)
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 480
  filter.connect(masterGain)
  ;[55, 82.4, 110].forEach((f, i) => {
    const osc = audioCtx.createOscillator()
    osc.type = i === 2 ? 'triangle' : 'sawtooth'
    osc.frequency.value = f
    osc.detune.value = (i - 1) * 6
    osc.connect(filter)
    osc.start()
  })
  const lfo = audioCtx.createOscillator()
  const lfoGain = audioCtx.createGain()
  lfo.frequency.value = 0.08
  lfoGain.gain.value = 120
  lfo.connect(lfoGain)
  lfoGain.connect(filter.frequency)
  lfo.start()
}
if (audioBtn) {
  audioBtn.addEventListener('click', () => {
    if (!audioCtx) startAudio()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    audioOn = !audioOn
    audioBtn.classList.toggle('playing', audioOn)
    gsap.to(masterGain.gain, { value: audioOn ? 0.12 : 0, duration: 1.2 })
  })
}

/* ============================================================
   RENDER LOOP
============================================================ */
const timer = new THREE.Timer()
renderer.setAnimationLoop(() => {
  timer.update()
  const delta = timer.getDelta()
  const time = timer.getElapsed()

  if (mixer) mixer.update(delta)

  // Idle float
  astroFloat.position.y = Math.sin(time * 0.6) * 0.18
  astroFloat.rotation.z = Math.cos(time * 0.4) * 0.06
  astroFloat.rotation.x = Math.sin(time * 0.3) * 0.04

  // Earth systems
  earth.rotation.y += delta * 0.02
  clouds.rotation.y += delta * 0.028
  stars.rotation.y += delta * 0.004
  dust.rotation.y -= delta * 0.01
  dust.rotation.x += delta * 0.006

  // Camera: choreographed base + mouse parallax
  const px = mouse.x * 0.8
  const py = -mouse.y * 0.8
  camera.position.set(camBase.x + px, camBase.y + py, camBase.z)
  _look.set(lookAt.x, lookAt.y, lookAt.z)
  camera.lookAt(_look)

  // Day/night sun direction in view space
  sunViewDir.value.copy(sunWorldDir).transformDirection(camera.matrixWorldInverse)

  // HUD telemetry (throttled)
  if (++hudTick % 6 === 0) {
    if (latEl) latEl.textContent = (Math.sin(time * 0.05) * 78).toFixed(2)
    if (lonEl) lonEl.textContent = (((time * 3) % 360) - 180).toFixed(2)
    o2 = Math.max(11, o2 - delta * 0.02)
    if (o2El) o2El.textContent = o2.toFixed(0)
  }

  postFXPass.uniforms.time.value = time
  composer.render()
})

/* ============================================================
   RESIZE
============================================================ */
window.addEventListener('resize', () => {
  const w = window.innerWidth
  const h = window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  renderer.setPixelRatio(QUALITY.dpr)
  composer.setSize(w, h)
  ScrollTrigger.refresh()
})
