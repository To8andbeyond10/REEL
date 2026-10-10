// Rendering setup: HDR post-processing (bloom, ambient occlusion, colour grading) and three quality levels.
// Low skips post-processing entirely; Medium adds bloom and grading; High adds ambient occlusion, MSAA and
// mirror reflections on the water.
import * as pc from 'playcanvas';

export const QUALITY = {
  low: { label: 'Low', frame: false, ssao: false, samples: 1, reflection: 'sky', shadowRes: 1024, pixelRatio: 1, foliage: 0.6 },
  medium: { label: 'Medium', frame: true, ssao: false, samples: 1, reflection: 'sky', shadowRes: 2048, pixelRatio: 1.5, foliage: 0.85 },
  high: { label: 'High', frame: true, ssao: true, samples: 4, reflection: 'planar', shadowRes: 2048, pixelRatio: 2, foliage: 1 }
};

const KEY = 'memefishing.quality';

export function savedQuality() {
  try {
    const q = localStorage.getItem(KEY);
    if (q && QUALITY[q]) return q;
  } catch {
    // Private windows can block storage; fall through to the default.
  }
  return pc.platform.mobile ? 'medium' : 'high';
}

export function saveQuality(q) {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    // Not saved, but the setting still applies for this session.
  }
}

export class Renderer {
  constructor(app, camera) {
    this.app = app;
    this.camera = camera;
    this.frame = null;
    this.grade = { saturation: 1, contrast: 1, brightness: 1, tint: [1, 1, 1] };
    this.set(savedQuality());
  }

  set(level) {
    this.level = QUALITY[level] ? level : 'high';
    const q = QUALITY[this.level];
    this.q = q;
    this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.app.resizeCanvas();
    if (q.frame && !this.frame) {
      this.frame = new pc.CameraFrame(this.app, this.camera.camera);
    }
    if (this.frame) {
      this.frame.enabled = q.frame;
      if (q.frame) this.configure();
    }
    // Without the frame passes the camera tone maps and gamma corrects itself.
    this.camera.camera.toneMapping = pc.TONEMAP_ACES2;
    this.camera.camera.gammaCorrection = pc.GAMMA_SRGB;
  }

  configure() {
    const f = this.frame;
    const q = this.q;
    f.rendering.toneMapping = pc.TONEMAP_ACES2;
    f.rendering.samples = q.samples;
    f.rendering.sharpness = q.samples > 1 ? 0 : 0.25;
    f.bloom.intensity = 0.012;
    f.bloom.blurLevel = 14;
    f.ssao.type = q.ssao ? pc.SSAOTYPE_COMBINE : pc.SSAOTYPE_NONE;
    f.ssao.intensity = 0.55;
    f.ssao.radius = 1.6;
    f.ssao.samples = 12;
    f.ssao.power = 4;
    f.ssao.minAngle = 15;
    f.ssao.scale = 0.5;
    f.vignette.intensity = 0.32;
    f.vignette.inner = 0.55;
    f.vignette.outer = 1.25;
    f.vignette.curvature = 0.6;
    f.grading.enabled = true;
    this.applyGrade();
  }

  // Weather and time of day set the grade: muted and cool in storms, a touch warmer at golden hour.
  setGrade({ saturation = 1, contrast = 1, brightness = 1, tint = [1, 1, 1] }) {
    this.grade = { saturation, contrast, brightness, tint };
    this.applyGrade();
  }

  applyGrade() {
    if (!this.frame || !this.q.frame) return;
    const g = this.grade;
    const f = this.frame;
    f.grading.saturation = g.saturation;
    f.grading.contrast = g.contrast;
    f.grading.brightness = g.brightness;
    f.grading.tint = new pc.Color(g.tint[0], g.tint[1], g.tint[2], 1);
    f.update();
  }
}
