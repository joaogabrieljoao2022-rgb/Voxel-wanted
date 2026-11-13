import * as THREE from 'three';

export interface ProceduralTextureSet {
  asphalt: THREE.CanvasTexture;
  sidewalk: THREE.CanvasTexture;
  grass: THREE.CanvasTexture;
  dirtRoad: THREE.CanvasTexture;
  sand: THREE.CanvasTexture;
  water: THREE.CanvasTexture;
  buildingFacade: THREE.CanvasTexture;
  weatherParticle: THREE.CanvasTexture;
}

function seededRand(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTiledCanvas(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  repeatX: number,
  repeatY: number,
  anisotropy = 1,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

let cachedSet: ProceduralTextureSet | null = null;

export function getProceduralTextures(anisotropy = 1): ProceduralTextureSet {
  if (cachedSet) return cachedSet;

  // 1. City Asphalt (crisp dark aggregate + subtle tire lanes + tar seams)
  const asphalt = makeTiledCanvas(
    256,
    (ctx, s) => {
      const rand = seededRand(101);
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, s, s);

      // Aggregate grain in 4x4 pixel voxel-friendly micro-tiles
      for (let y = 0; y < s; y += 4) {
        for (let x = 0; x < s; x += 4) {
          const r = rand();
          if (r < 0.28) {
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fillRect(x, y, 4, 4);
          } else if (r < 0.52) {
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.fillRect(x, y, 4, 4);
          }
        }
      }

      // Subtle worn tire bands
      ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
      ctx.fillRect(s * 0.16, 0, s * 0.14, s);
      ctx.fillRect(s * 0.70, 0, s * 0.14, s);

      // Faint asphalt seam lines
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.fillRect(0, s * 0.48, s, 2);
    },
    1,
    4,
    anisotropy,
  );

  // 2. Concrete Sidewalk Pavers
  const sidewalk = makeTiledCanvas(
    256,
    (ctx, s) => {
      const rand = seededRand(202);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(0, 0, s, s);

      const step = 64;
      for (let gy = 0; gy < s; gy += step) {
        for (let gx = 0; gx < s; gx += step) {
          const shade = Math.floor((rand() - 0.5) * 14);
          ctx.fillStyle = `rgb(${152 + shade}, ${165 + shade}, ${182 + shade})`;
          ctx.fillRect(gx + 2, gy + 2, step - 4, step - 4);
          ctx.strokeStyle = 'rgba(51, 65, 85, 0.42)';
          ctx.lineWidth = 3;
          ctx.strokeRect(gx + 1.5, gy + 1.5, step - 3, step - 3);
        }
      }

      for (let i = 0; i < 180; i++) {
        ctx.fillStyle =
          rand() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
        ctx.fillRect(
          Math.floor(rand() * 64) * 4,
          Math.floor(rand() * 64) * 4,
          4,
          4,
        );
      }
    },
    3,
    3,
    anisotropy,
  );

  // 3. Countryside Lush Grass Turf
  const grass = makeTiledCanvas(
    256,
    (ctx, s) => {
      const rand = seededRand(303);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(0, 0, s, s);

      const tile = 16;
      for (let y = 0; y < s; y += tile) {
        for (let x = 0; x < s; x += tile) {
          const r = rand();
          if (r < 0.35) {
            ctx.fillStyle = '#38c96c';
            ctx.fillRect(x, y, tile, tile);
          } else if (r < 0.55) {
            ctx.fillStyle = '#5ee890';
            ctx.fillRect(x, y, tile, tile);
          }
        }
      }

      // Small grass tufts & wildflowers
      for (let i = 0; i < 65; i++) {
        const px = Math.floor(rand() * 32) * 8;
        const py = Math.floor(rand() * 32) * 8;
        ctx.fillStyle = rand() < 0.85 ? '#16a34a' : '#fef08a';
        ctx.fillRect(px, py, 6, 6);
      }
    },
    4,
    4,
    anisotropy,
  );

  // 4. Dirt / Gravel Countryside & Desert Track
  const dirtRoad = makeTiledCanvas(
    256,
    (ctx, s) => {
      const rand = seededRand(404);
      ctx.fillStyle = '#9a8468';
      ctx.fillRect(0, 0, s, s);

      // Subtle tire ruts
      ctx.fillStyle = 'rgba(92, 72, 50, 0.28)';
      ctx.fillRect(s * 0.2, 0, s * 0.14, s);
      ctx.fillRect(s * 0.66, 0, s * 0.14, s);

      for (let i = 0; i < 240; i++) {
        const x = Math.floor(rand() * 64) * 4;
        const y = Math.floor(rand() * 64) * 4;
        ctx.fillStyle =
          rand() < 0.5
            ? 'rgba(255, 245, 225, 0.14)'
            : 'rgba(60, 42, 24, 0.16)';
        ctx.fillRect(x, y, 6, 6);
      }
    },
    1,
    4,
    anisotropy,
  );

  // 5. Desert Rippled Sand
  const sand = makeTiledCanvas(
    256,
    (ctx, s) => {
      const rand = seededRand(505);
      ctx.fillStyle = '#f5b938';
      ctx.fillRect(0, 0, s, s);

      // Wind-blown pixel dune bands
      for (let y = 0; y < s; y += 16) {
        ctx.fillStyle =
          (y / 16) % 2 === 0
            ? 'rgba(254, 240, 138, 0.24)'
            : 'rgba(180, 83, 9, 0.14)';
        for (let x = 0; x < s; x += 16) {
          const wave = Math.round(Math.sin((x / s) * Math.PI * 2) * 4);
          ctx.fillRect(x, (y + wave + s) % s, 16, 6);
        }
      }

      // Pebbles
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle =
          rand() < 0.5 ? 'rgba(146, 64, 14, 0.28)' : 'rgba(254, 249, 195, 0.35)';
        ctx.fillRect(
          Math.floor(rand() * 64) * 4,
          Math.floor(rand() * 64) * 4,
          4,
          4,
        );
      }
    },
    4,
    4,
    anisotropy,
  );

  // 6. River Water
  const water = makeTiledCanvas(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(0, 0, s, s);

      for (let y = 0; y < s; y += 32) {
        ctx.fillStyle = 'rgba(125, 211, 252, 0.26)';
        for (let x = 0; x < s; x += 32) {
          const offset = (y / 32) % 2 === 0 ? 0 : 16;
          ctx.fillRect((x + offset) % s, y + 8, 18, 6);
        }
        ctx.fillStyle = 'rgba(3, 105, 161, 0.26)';
        ctx.fillRect(0, y + 22, s, 4);
      }
    },
    4,
    1,
    anisotropy,
  );

  // 7. Building Facade (white-tinted masonry + crisp lit/sky-tinted windows)
  const buildingFacade = makeTiledCanvas(
    256,
    (ctx, s) => {
      const rand = seededRand(707);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, s, s);

      // Subtle vertical concrete ribs
      for (let x = 0; x < s; x += 32) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
        ctx.fillRect(x, 0, 3, s);
      }
      // Floor band seams
      for (let y = 0; y < s; y += 64) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
        ctx.fillRect(0, y, s, 6);
      }

      // Grid of windows
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          const wx = col * 64 + 12;
          const wy = row * 64 + 14;
          const lit = rand();
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(wx - 2, wy - 2, 44, 38);
          ctx.fillStyle =
            lit < 0.25 ? '#fef08a' : lit < 0.65 ? '#bae6fd' : '#38bdf8';
          ctx.fillRect(wx, wy, 40, 34);
          // Window mullion cross
          ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
          ctx.fillRect(wx + 18, wy, 3, 34);
        }
      }
    },
    2,
    2,
    anisotropy,
  );

  // 8. Soft square-glow sprite for weather particles
  const pCanvas = document.createElement('canvas');
  pCanvas.width = 32;
  pCanvas.height = 32;
  const pCtx = pCanvas.getContext('2d')!;
  const grad = pCtx.createRadialGradient(16, 16, 2, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  pCtx.fillStyle = grad;
  pCtx.fillRect(0, 0, 32, 32);
  const weatherParticle = new THREE.CanvasTexture(pCanvas);
  weatherParticle.colorSpace = THREE.SRGBColorSpace;

  cachedSet = {
    asphalt,
    sidewalk,
    grass,
    dirtRoad,
    sand,
    water,
    buildingFacade,
    weatherParticle,
  };
  return cachedSet;
}
