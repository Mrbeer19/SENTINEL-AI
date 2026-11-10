import * as THREE from "three";

const rad = Math.PI / 180;
const point = (lat, lon, r = 2.42) =>
  new THREE.Vector3(
    r * Math.cos(lat * rad) * Math.cos(lon * rad),
    r * Math.sin(lat * rad),
    -r * Math.cos(lat * rad) * Math.sin(lon * rad),
  );
const poses = {
  sources: [4.7, -0.8, 1.65, -2.5, 0.2],
  network: [4.7, -0.8, 1.65, -2.7, 0.2],
  overview: [0, -0.4, 1, -2.5, 0.2],
  login: [-1.8, -2.4, 1.15, -2.1, 0.2],
  incidents: [4.7, -0.8, 1.65, -2.05, 0.18],
  incident: [5.2, -0.65, 1.65, -2.3, 0.2],
  trace: [5.6, -0.7, 1.7, -1.9, 0.2],
  rules: [4.9, -0.7, 1.65, -2.1, 0.2],
  reports: [5.2, -0.9, 1.65, -2, 0.2],
  approvals: [7, -1.3, 0.6, -2.5, 0.2],
};
export function createPosterGlobe(
  canvas,
  { onMarkers, onZoom, onSpin, onFailure },
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-5, 5, 3, -3, 0.1, 100);
  camera.position.z = 15;
  const world = new THREE.Group();
  scene.add(world);
  world.rotation.order = "XYZ";
  const geometry = new THREE.SphereGeometry(2.4, 64, 40);
  const material = new THREE.MeshPhongMaterial({
    color: 0xb8c8d1,
    shininess: 9,
    specular: 0x607582,
  });
  world.add(new THREE.Mesh(geometry, material));
  scene.add(new THREE.AmbientLight(0xd7e5ec, 1.8));
  const light = new THREE.DirectionalLight(0xf4faff, 3);
  light.position.set(-4, 5, 9);
  scene.add(light);
  const rim = new THREE.DirectionalLight(0x8ab3cb, 1.5);
  rim.position.set(4, 1, -3);
  scene.add(rim);
  const textures = [],
    loader = new THREE.TextureLoader();
  let disposed = false,
    active = true,
    frame = 0,
    last = 0,
    lastDraw = 0,
    renderCount = 0;
  loader.load(
    "/assets/poster/earth.jpg",
    (texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      const image = texture.image,
        c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      const context = c.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const [r, g, b] = [
          pixels.data[i],
          pixels.data[i + 1],
          pixels.data[i + 2],
        ];
        const v =
          b > r * 1.12 && b > g * 1.03
            ? 15
            : 28 + (0.26 * r + 0.64 * g + 0.1 * b) * 0.78;
        pixels.data[i] = v * 0.92;
        pixels.data[i + 1] = v * 0.98;
        pixels.data[i + 2] = v * 1.06;
      }
      context.putImageData(pixels, 0, 0);
      const silver = new THREE.CanvasTexture(c);
      silver.colorSpace = THREE.SRGBColorSpace;
      material.map = silver;
      material.needsUpdate = true;
      textures.push(silver);
      texture.dispose();
      wake();
    },
    undefined,
    () => {},
  );
  loader.load("/assets/poster/earth-normal.jpg", (texture) => {
    if (disposed) {
      texture.dispose();
      return;
    }
    material.normalMap = texture;
    material.normalScale = new THREE.Vector2(0.4, 0.4);
    material.needsUpdate = true;
    textures.push(texture);
    wake();
  });
  let target = poses.overview,
    zoom = 1,
    desiredZoom = 1,
    size = { width: 1000, height: 700 },
    yaw = target[3],
    pitch = target[4],
    scale = 1,
    spinning = false,
    dragging = false,
    focusMode = false,
    markers = [];
  world.position.set(target[0], target[1], 0);
  world.rotation.set(pitch, yaw, 0);
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function wake() {
    if (active && !disposed && !frame && !document.hidden)
      frame = requestAnimationFrame(draw);
  }
  function shortest(value, current) {
    return (
      current + Math.atan2(Math.sin(value - current), Math.cos(value - current))
    );
  }
  function setZoom(value) {
    desiredZoom = THREE.MathUtils.clamp(value, 0.75, 1.6);
    const next = focusMode ? desiredZoom > 1.04 : desiredZoom > 1.09;
    if (next !== focusMode) {
      focusMode = next;
      onZoom(next);
    }
    spinning = false;
    onSpin(false);
    wake();
  }
  function draw(now) {
    frame = 0;
    if (!active || disposed || document.hidden) return;
    if (now - lastDraw < 1000 / 30) {
      wake();
      return;
    }
    lastDraw = now;
    const dt = Math.min(50, now - (last || now));
    last = now;
    const ease = reduced() ? 1 : 1 - Math.exp(-dt * 0.007);
    if (spinning && !dragging) yaw -= dt * 0.00007;
    world.position.x += (target[0] - world.position.x) * ease;
    world.position.y += (target[1] - world.position.y) * ease;
    scale += (target[2] - scale) * ease;
    zoom += (desiredZoom - zoom) * ease;
    world.scale.setScalar(scale * zoom);
    world.rotation.y +=
      (shortest(yaw, world.rotation.y) - world.rotation.y) * ease;
    world.rotation.x += (pitch - world.rotation.x) * ease;
    const projected = markers.map((item) => {
      const local = point(item.latitude, item.longitude).applyEuler(
        world.rotation,
      );
      const p = local
        .clone()
        .multiplyScalar(scale * zoom)
        .add(world.position)
        .project(camera);
      return {
        ...item,
        x: ((p.x + 1) * size.width) / 2,
        y: ((1 - p.y) * size.height) / 2,
        visible: local.z > 0.08 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1,
      };
    });
    onMarkers(projected);
    renderer.render(scene, camera);
    renderCount++;
    const moving =
      spinning ||
      dragging ||
      Math.abs(target[0] - world.position.x) > 0.002 ||
      Math.abs(target[1] - world.position.y) > 0.002 ||
      Math.abs(target[2] - scale) > 0.002 ||
      Math.abs(desiredZoom - zoom) > 0.002 ||
      Math.abs(shortest(yaw, world.rotation.y) - world.rotation.y) > 0.002 ||
      Math.abs(pitch - world.rotation.x) > 0.002;
    if (moving) wake();
  }
  let previous;
  function down(event) {
    dragging = true;
    spinning = false;
    onSpin(false);
    previous = [event.clientX, event.clientY];
    canvas.setPointerCapture(event.pointerId);
    wake();
  }
  function move(event) {
    if (!dragging) return;
    yaw += (event.clientX - previous[0]) * 0.006;
    pitch = THREE.MathUtils.clamp(
      pitch + (event.clientY - previous[1]) * 0.003,
      -1.1,
      1.1,
    );
    previous = [event.clientX, event.clientY];
    wake();
  }
  function up() {
    dragging = false;
    wake();
  }
  function wheel(event) {
    event.preventDefault();
    setZoom(desiredZoom - Math.sign(event.deltaY) * 0.1);
  }
  function key(event) {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "+",
        "=",
        "-",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    spinning = false;
    onSpin(false);
    if (event.key === "ArrowLeft") yaw += 0.15;
    if (event.key === "ArrowRight") yaw -= 0.15;
    if (event.key === "ArrowUp") pitch = Math.min(1.1, pitch + 0.12);
    if (event.key === "ArrowDown") pitch = Math.max(-1.1, pitch - 0.12);
    if (["+", "="].includes(event.key)) setZoom(desiredZoom + 0.1);
    if (event.key === "-") setZoom(desiredZoom - 0.1);
    wake();
  }
  function lost(event) {
    event.preventDefault();
    onFailure();
  }
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("keydown", key);
  canvas.addEventListener("webglcontextlost", lost);
  const visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else {
      last = 0;
      wake();
    }
  };
  document.addEventListener("visibilitychange", visibility);
  return {
    resize(width, height) {
      size = { width, height };
      const pixels = Math.min(width, 1400);
      renderer.setSize(pixels, Math.round((pixels * height) / width), false);
      camera.left = (-3 * width) / height;
      camera.right = (3 * width) / height;
      camera.updateProjectionMatrix();
      wake();
    },
    pose(page) {
      target = poses[page] || poses.overview;
      yaw = shortest(target[3], world.rotation.y);
      pitch = target[4];
      setZoom(1);
      active = page !== "approvals";
      if (!active) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      wake();
    },
    markers(value) {
      markers = value;
      wake();
    },
    focus(geo) {
      if (!geo || !Number.isFinite(geo.latitude)) return;
      yaw = shortest(-(90 + geo.longitude) * rad, world.rotation.y);
      pitch = THREE.MathUtils.clamp(geo.latitude * rad - 0.4, -1, 1);
      spinning = false;
      onSpin(false);
      wake();
    },
    zoom(delta) {
      setZoom(desiredZoom + delta);
    },
    reset() {
      yaw = target[3];
      pitch = target[4];
      setZoom(1);
    },
    toggle() {
      spinning = !spinning && !reduced();
      onSpin(spinning);
      wake();
    },
    diagnostics() {
      return {
        renderCount,
        pending: !!frame,
        width: canvas.width,
        height: canvas.height,
      };
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("keydown", key);
      canvas.removeEventListener("webglcontextlost", lost);
      textures.forEach((t) => t.dispose());
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
