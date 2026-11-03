import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import { FLOW_STAGES, packetPosition } from "./agentFlowModel.js";

// Loaded on demand; neither the overview nor the login page imports WebGL dependencies.
export function createAgentScene(host, { onSelect, onFailure }) {
  const nodes = [],
    links = [],
    visuals = [],
    packets = [];
  let graph,
    frame,
    resize,
    intersection,
    themeObserver,
    disposed = false,
    inView = true;
  let view = {
    states: [],
    selected: 0,
    paused: false,
    orbit: false,
    reduced: false,
    replay: false,
    leg: -1,
  };
  let elapsed = 0,
    lastTime = performance.now(),
    transfer = -1,
    transferAge = 4,
    front = false;
  let palette;
  const sphere = new THREE.SphereGeometry(1, 24, 16);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = getComputedStyle(host).getPropertyValue("--text").trim();
  ctx.fillRect(0, 0, 64, 64);
  const glow = new THREE.CanvasTexture(canvas);
  const geometry = (obj) => obj.geometry;
  function readPalette() {
    const css = getComputedStyle(host);
    palette = {
      bg: css.getPropertyValue("--spatial-bg").trim(),
      text: css.getPropertyValue("--spatial-text").trim(),
      idle: css.getPropertyValue("--spatial-idle").trim(),
      line: css.getPropertyValue("--spatial-line").trim(),
      done: css.getPropertyValue("--spatial-done").trim(),
      active: css.getPropertyValue("--spatial-active").trim(),
      fail: css.getPropertyValue("--spatial-fail").trim(),
      light: css.getPropertyValue("--spatial-light").trim() || css.getPropertyValue("--spatial-text").trim(),
    };
    graph?.backgroundColor(palette.bg).linkColor(linkColor);
    graph?.lights().forEach((light) => light.color.set(palette.light));
    for (const v of visuals)
      if (v.label) {
        v.label.color = palette.text;
        v.label.backgroundColor = palette.bg;
      }
  }
  function color(state) {
    return palette[
      state === "done"
        ? "done"
        : state === "active"
          ? "active"
          : state === "fail"
            ? "fail"
            : "idle"
    ];
  }
  function linkColor(link) {
    const next = view.states[link.leg + 1];
    return next === "active" && view.states[link.leg] === "done"
      ? palette.active
      : next === "done" && view.states[link.leg] === "done"
        ? palette.done
        : palette.line;
  }
  function resetCamera(face = false, duration = 450) {
    if (!graph || !host.clientWidth || !host.clientHeight) return;
    front = face;
    const aspect = host.clientWidth / host.clientHeight;
    const distance = Math.max(
      350,
      1000 / (2 * Math.tan((graph.camera().fov * Math.PI) / 360) * aspect),
    );
    graph.cameraPosition(
      face ? { x: 0, y: 18, z: distance } : { x: 75, y: 100, z: distance },
      { x: 0, y: 0, z: 0 },
      view.reduced ? 0 : duration,
    );
  }
  function makeNode(node) {
    const group = new THREE.Group(),
      material = new THREE.MeshLambertMaterial({
        color: palette.idle,
        emissive: palette.idle,
        emissiveIntensity: 0,
      });
    const ball = new THREE.Mesh(sphere, material);
    ball.scale.setScalar(node.lane === 1 ? 14 : 8.5);
    group.add(ball);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        color: palette.done,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.visible = false;
    halo.scale.setScalar(node.lane === 1 ? 43 : 30);
    group.add(halo);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(node.lane === 1 ? 14 : 10, 0.2, 8, 48),
      new THREE.MeshBasicMaterial({
        color: palette.idle,
        transparent: true,
        opacity: 0.3,
      }),
    );
    ring.rotation.x = 0.55;
    group.add(ring);
    let label;
    if (node.lane === 1) {
      label = new SpriteText(
        `${String(node.stage + 1).padStart(2, "0")}\n${FLOW_STAGES[node.stage].title}`,
        14,
        palette.text,
      );
      label.fontFace = '"IBM Plex Sans", "IBM Plex Sans Thai", sans-serif';
      label.position.set(0, 83, 0);
      label.backgroundColor = palette.bg;
      label.padding = [2, 4];
      label.borderRadius = 2;
      group.add(label);
    }
    visuals.push({ node, ball, material, halo, ring, label });
    return group;
  }
  function suspend() {
    if (document.hidden || !inView) graph?.pauseAnimation();
    else {
      graph?.resumeAnimation();
      lastTime = performance.now();
    }
  }
  function contextLost(event) {
    event.preventDefault();
    onFailure(
      "กราฟสามมิติหยุดทำงาน รายการขั้นตอนและข้อมูลด้านล่างยังใช้งานได้",
    );
  }
  function destroy() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    resize?.disconnect();
    intersection?.disconnect();
    themeObserver?.disconnect();
    document.removeEventListener("visibilitychange", suspend);
    const renderer = graph?.renderer();
    renderer?.domElement.removeEventListener("webglcontextlost", contextLost);
    const geometries = new Set([sphere]),
      materials = new Set(),
      textures = new Set([glow]);
    graph?.scene().traverse((obj) => {
      if (geometry(obj)) geometries.add(obj.geometry);
      for (const m of [obj.material].flat().filter(Boolean)) {
        materials.add(m);
        if (m.map) textures.add(m.map);
      }
    });
    graph?._destructor();
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    renderer?.dispose();
    renderer?.forceContextLoss();
    host.replaceChildren();
  }
  try {
    readPalette();
    FLOW_STAGES.forEach((s, i) => {
      for (let lane = 0; lane < 3; lane++) {
        const x = (i - 2.5) * 130,
          y = [44, 0, -44][lane],
          z = [-23, 18, -15][lane] + (i % 2 ? 12 : -12);
        nodes.push({
          id: `${i}-${lane}`,
          stage: i,
          lane,
          x,
          y,
          z,
          fx: x,
          fy: y,
          fz: z,
        });
      }
    });
    for (let leg = 0; leg < 5; leg++)
      for (let lane = 0; lane < 3; lane++)
        for (let branch = 0; branch < 2; branch++)
          links.push({
            source: `${leg}-${lane}`,
            target: `${leg + 1}-${(lane + branch) % 3}`,
            leg,
            lane,
          });
    graph = new ForceGraph3D(host, {
      controlType: "orbit",
      rendererConfig: { antialias: true, alpha: true },
    })
      .width(host.clientWidth)
      .height(host.clientHeight)
      .backgroundColor(palette.bg)
      .showNavInfo(false)
      .nodeThreeObject(makeNode)
      .nodeLabel("") // No HTML tooltip may contain event/log text.
      .enableNodeDrag(false)
      .linkColor(linkColor)
      .linkOpacity(0.55)
      .linkWidth((link) => link.lane === 1 ? 0.8 : 0.4)
      .linkDirectionalArrowLength(4)
      .linkDirectionalArrowRelPos(0.6)
      .linkDirectionalParticles(0)
      .cooldownTicks(0)
      .graphData({ nodes, links })
      .onNodeClick((n) => onSelect(n.stage));
    graph.renderer().setPixelRatio(Math.min(devicePixelRatio, 1.6));
    const light = new THREE.DirectionalLight(palette.light, 4);
    light.position.set(-200, 500, 450);
    graph.lights([new THREE.AmbientLight(palette.light, 3), light]);
    const floor = new THREE.GridHelper(1000, 38, palette.line, palette.line);
    floor.position.y = -98;
    floor.material.transparent = true;
    floor.material.opacity = 0.05;
    graph.scene().add(floor);
    const controls = graph.controls();
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 140;
    controls.maxDistance = 1800;
    for (const link of links) {
      const source = nodes.find(
          (n) => n.id === (link.source.id || link.source),
        ),
        target = nodes.find((n) => n.id === (link.target.id || link.target));
      const head = new THREE.Mesh(
        sphere,
        new THREE.MeshBasicMaterial({
          color: palette.done,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      head.scale.setScalar(5);
      graph.scene().add(head);
      const tail = Array.from({ length: 3 }, (_, k) => {
        const t = new THREE.Mesh(sphere, head.material.clone());
        t.scale.setScalar(4 - k * 0.65);
        graph.scene().add(t);
        return t;
      });
      packets.push({ link, source, target, head, tail });
    }
    graph
      .renderer()
      .domElement.addEventListener("webglcontextlost", contextLost);
    resize = new ResizeObserver(() => {
      if (!disposed && host.clientWidth) {
        graph.width(host.clientWidth).height(host.clientHeight);
        resetCamera(front, 0);
      }
    });
    resize.observe(host);
    intersection = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      suspend();
    });
    intersection.observe(host);
    themeObserver = new MutationObserver(readPalette);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    document.addEventListener("visibilitychange", suspend);
    resetCamera(false, 0);
    host.dataset.ready = "true";
    function tick(now) {
      if (disposed) return;
      const dt = Math.min(0.12, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      if (!view.paused && !document.hidden && inView) {
        elapsed += dt;
        transferAge += dt;
      }
      const active = view.states.findIndex(
        (s, i) => s === "active" && i > 0,
      );
      const leg = view.replay
        ? view.leg
        : active > 0
          ? active - 1
          : transferAge <= 3.3
            ? transfer
            : -1;
      const travel = view.replay
        ? view.seconds()
        : active > 0
          ? elapsed % 3.2
          : transferAge;
      for (const v of visuals) {
        const state = view.states[v.node.stage],
          c = color(state);
        v.material.color.set(c);
        v.material.emissive.set(c);
        v.halo.material.color.set(c);
        v.halo.material.opacity =
          state === "wait" || state === "skip" ? 0.04 : 0.35;
        v.ring.material.color.set(c);
        v.ring.material.opacity = v.node.stage === view.selected ? 0.9 : 0.16;
      }
      for (const packet of packets) {
        const { source: a, target: b, link, head, tail } = packet,
          recorded = !view.replay &&
            view.states[link.leg] === "done" &&
            view.states[link.leg + 1] === "done",
          packetTime = recorded && link.leg !== leg
            ? (elapsed + link.leg * 0.45) % 3.2
            : travel,
          p = packetPosition(packetTime || 0, link.lane);
        const allowed =
          view.states[link.leg] === "done" &&
          !["skip", "wait"].includes(view.states[link.leg + 1]);
        const alpha =
          !view.reduced && (link.leg === leg || recorded) && p > 0 && allowed
            ? (recorded ? 0.7 : 1) * (packetTime <= 2.8
              ? 1
              : Math.max(0, 1 - (packetTime - 2.8) / 0.5))
            : 0;
        const packetColor = view.states[link.leg + 1] === "active" ? palette.active : palette.done;
        head.material.color.set(packetColor);
        head.material.opacity = alpha;
        head.position.set(
          a.x + (b.x - a.x) * p,
          a.y + (b.y - a.y) * p,
          a.z + (b.z - a.z) * p,
        );
        tail.forEach((t, k) => {
          const q = Math.max(0, p - (k + 1) * 0.034);
          t.material.color.set(packetColor);
          t.material.opacity = alpha * (0.4 - k * 0.1);
          t.position.set(
            a.x + (b.x - a.x) * q,
            a.y + (b.y - a.y) * q,
            a.z + (b.z - a.z) * q,
          );
        });
      }
      controls.autoRotate = view.orbit && !view.reduced;
      controls.autoRotateSpeed = 0.35;
      host.dataset.motionClock = elapsed.toFixed(4);
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return {
      setView(next) {
        const recolor = next.states.join() !== view.states.join();
        const changed = next.states.findIndex(
          (s, i) =>
            i > 0 && s !== view.states[i] && !["wait", "skip"].includes(s),
        );
        if (changed > 0 && view.states.length) {
          transfer = changed - 1;
          transferAge = 0;
        }
        view = next;
        if (recolor) graph.linkColor(linkColor);
      },
      resetCamera,
      destroy,
    };
  } catch (error) {
    destroy();
    throw error;
  }
}
