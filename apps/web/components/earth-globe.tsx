"use client";

import { repoNodes } from "@agent/repo-graph";
import { Gamepad2, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type GlobeProject = {
  id: string;
  label: string;
  shortLabel: string;
  summary: string;
  lat: number;
  lon: number;
  color: string;
};

type ProjectDetail = {
  eyebrow: string;
  title: string;
  preview: "web" | "crypto" | "package" | "game" | "analytics" | "data" | "docs";
  lastBuilt: string;
  commit: string;
  commitSummary: string;
};

const projectLocations: Record<string, Pick<GlobeProject, "lat" | "lon" | "color">> = {
  web: { lat: 37.7749, lon: -122.4194, color: "#9f7aea" },
  "crypto-trader": { lat: 40.7128, lon: -74.006, color: "#22c55e" },
  ui: { lat: 51.5072, lon: -0.1276, color: "#67e8f9" },
  "repo-graph": { lat: 35.6762, lon: 139.6503, color: "#facc15" },
  "unity-rpg": { lat: 34.0522, lon: -118.2437, color: "#fb7185" },
  dbt: { lat: 59.3293, lon: 18.0686, color: "#34d399" },
  seeds: { lat: 1.3521, lon: 103.8198, color: "#2dd4bf" },
  docs: { lat: -33.8688, lon: 151.2093, color: "#f8fafc" }
};

const legacyTinyPhoneMediaQuery = "(max-width: 340px) and (max-height: 620px)";

const projectDetails: Record<string, ProjectDetail> = {
  web: {
    eyebrow: "Next.js app",
    title: "Project Sphere web surface",
    preview: "web",
    lastBuilt: "2026-06-16 workspace build",
    commit: "52394b5 · 2026-06-15",
    commitSummary: "Initial scaffold with the web app, shared packages, Unity slot, analytics POC, and docs."
  },
  "crypto-trader": {
    eyebrow: "Trading experiment",
    title: "Kraken dry-run trader",
    preview: "crypto",
    lastBuilt: "2026-06-16 workspace build",
    commit: "69bd8a3 · 2026-06-16",
    commitSummary: "Adds a guarded spot-trading POC with scan, dry tick, live tick, state, indicators, and Kraken API code."
  },
  ui: {
    eyebrow: "Shared package",
    title: "Interface primitives",
    preview: "package",
    lastBuilt: "2026-06-16 workspace build",
    commit: "52394b5 · 2026-06-15",
    commitSummary: "Initial shared React primitives for panels and icon buttons."
  },
  "repo-graph": {
    eyebrow: "Shared metadata",
    title: "Repo graph model",
    preview: "package",
    lastBuilt: "2026-06-16 workspace build",
    commit: "52394b5 · 2026-06-15",
    commitSummary: "Initial typed project-node data, now expanded with labels, groups, and featured landmarks."
  },
  "unity-rpg": {
    eyebrow: "Game project",
    title: "Astral Rift WebGL slice",
    preview: "game",
    lastBuilt: "2026-06-16 workspace build",
    commit: "5cf9e6d · 2026-06-16",
    commitSummary: "Initial Unity RPG slot and WebGL mount; workspace now includes the Astral Rift build and embedded route."
  },
  dbt: {
    eyebrow: "Analytics POC",
    title: "dbt repo-health models",
    preview: "analytics",
    lastBuilt: "2026-06-16 workspace build",
    commit: "52394b5 · 2026-06-15",
    commitSummary: "Initial DuckDB/dbt proof of concept with seeds and repo-health model structure."
  },
  seeds: {
    eyebrow: "Data seed set",
    title: "Repo health seed data",
    preview: "data",
    lastBuilt: "2026-06-16 workspace build",
    commit: "52394b5 · 2026-06-15",
    commitSummary: "Initial CSV seeds for repos, events, and runs used by the analytics proof of concept."
  },
  docs: {
    eyebrow: "Documentation",
    title: "Architecture notes",
    preview: "docs",
    lastBuilt: "2026-06-16 workspace build",
    commit: "52394b5 · 2026-06-15",
    commitSummary: "Initial docs with the monorepo layout and operating architecture."
  }
};

export function EarthGlobe({ initialOpenProjectId }: { initialOpenProjectId?: string }) {
  const initialProjectId =
    initialOpenProjectId && projectLocations[initialOpenProjectId] ? initialOpenProjectId : "web";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const targetCameraRef = useRef<THREE.Vector3 | null>(null);
  const targetLookAtRef = useRef<THREE.Vector3 | null>(null);
  const markerRefs = useRef(new Map<string, THREE.Mesh>());
  const hasRenderedFrameRef = useRef(false);
  const [activeProjectId, setActiveProjectId] = useState(initialProjectId);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(initialOpenProjectId ? initialProjectId : null);
  const [isRpgOpen, setIsRpgOpen] = useState(false);
  const [isCanvasReady, setIsCanvasReady] = useState(false);

  const projects = useMemo(
    () =>
      repoNodes
        .filter((node) => projectLocations[node.id])
        .map((node) => ({
          id: node.id,
          label: node.label,
          shortLabel: node.shortLabel,
          summary: node.summary,
          ...projectLocations[node.id]
      })),
    []
  );
  const activeProject = projects.find((project) => project.id === detailProjectId);
  const activeDetail = detailProjectId ? projectDetails[detailProjectId] : undefined;
  const fallbackProjectData = useMemo(
    () =>
      projects.map((project) => ({
        ...project,
        detail: projectDetails[project.id]
      })),
    [projects]
  );

  const focusProject = useCallback((projectId: string) => {
    const marker = markerRefs.current.get(projectId);
    if (!marker) {
      return;
    }

    setActiveProjectId(projectId);
    const surface = marker.position.clone().normalize();
    targetCameraRef.current = surface.clone().multiplyScalar(1.72);
    targetLookAtRef.current = new THREE.Vector3(0, 0, 0);
  }, []);

  const selectProject = useCallback(
    (projectId: string) => {
      focusProject(projectId);
      setDetailProjectId(projectId);
    },
    [focusProject]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    if (window.matchMedia(legacyTinyPhoneMediaQuery).matches) {
      hasRenderedFrameRef.current = false;
      return;
    }

    hasRenderedFrameRef.current = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#02030a");

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.35, 3.45);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.userSelect = "none";
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 1.45;
    controls.maxDistance = 5.2;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.85;
    controlsRef.current = controls;

    const planetTexture = createPurplePlanetTexture();
    planetTexture.colorSpace = THREE.SRGBColorSpace;
    planetTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 96),
      new THREE.MeshStandardMaterial({
        map: planetTexture,
        roughness: 0.68,
        metalness: 0.08,
        emissive: "#12051f",
        emissiveIntensity: 0.32
      })
    );
    earth.rotation.y = -0.34;
    scene.add(earth);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.025, 96, 96),
      new THREE.MeshBasicMaterial({
        color: "#c084fc",
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide
      })
    );
    scene.add(atmosphere);

    const stars = createStarField();
    scene.add(stars);

    scene.add(new THREE.AmbientLight("#f3e8ff", 2.4));
    const sun = new THREE.DirectionalLight("#ffffff", 3.2);
    sun.position.set(-3, 1.5, 4);
    scene.add(sun);

    const markerGroup = new THREE.Group();
    const markers = markerRefs.current;
    scene.add(markerGroup);

    for (const project of projects) {
      const position = latLonToVector(project.lat, project.lon, 1.045);
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 24, 24),
        new THREE.MeshBasicMaterial({ color: project.color })
      );
      marker.position.copy(position);
      marker.userData = { projectId: project.id };
      markerGroup.add(marker);
      markers.set(project.id, marker);

      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 24, 24),
        new THREE.MeshBasicMaterial({
          color: project.color,
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending
        })
      );
      halo.position.copy(position);
      markerGroup.add(halo);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const handlePointerDown = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...markers.values()]);
      const hit = hits[0]?.object;
      if (hit?.userData.projectId) {
        selectProject(hit.userData.projectId as string);
      }
    };

    const animate = () => {
      const targetCamera = targetCameraRef.current;
      const targetLookAt = targetLookAtRef.current;
      if (targetCamera && targetLookAt) {
        camera.position.lerp(targetCamera, 0.075);
        controls.target.lerp(targetLookAt, 0.075);
        if (camera.position.distanceTo(targetCamera) < 0.01) {
          targetCameraRef.current = null;
          targetLookAtRef.current = null;
        }
      }

      earth.rotation.y += 0.00055;
      atmosphere.rotation.y += 0.00055;
      controls.update();
      renderer.render(scene, camera);

      if (!hasRenderedFrameRef.current) {
        hasRenderedFrameRef.current = true;
        setIsCanvasReady(true);
      }
    };

    renderer.setAnimationLoop(animate);
    resize();
    window.addEventListener("resize", resize);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      controls.dispose();
      renderer.dispose();
      earth.geometry.dispose();
      atmosphere.geometry.dispose();
      markerGroup.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          disposeMaterial(object.material);
        }
      });
      stars.geometry.dispose();
      disposeMaterial(stars.material);
      disposeMaterial(earth.material);
      disposeMaterial(atmosphere.material);
      planetTexture.dispose();
      markers.clear();
      hasRenderedFrameRef.current = false;
      renderer.domElement.remove();
    };
  }, [projects, selectProject]);

  const zoomBy = (amount: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const direction = camera.position.clone().sub(controls.target).normalize();
    const distance = camera.position.distanceTo(controls.target);
    const nextDistance = THREE.MathUtils.clamp(distance + amount, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target.clone().add(direction.multiplyScalar(nextDistance)));
  };

  const resetView = () => {
    targetCameraRef.current = new THREE.Vector3(0, 0.35, 3.45);
    targetLookAtRef.current = new THREE.Vector3(0, 0, 0);
    setActiveProjectId("web");
    setIsRpgOpen(false);
  };

  return (
    <main className="earth-shell">
      <div
        ref={containerRef}
        className={`earth-canvas ${isCanvasReady ? "earth-canvas--ready" : ""}`}
        aria-label="Interactive 3D project sphere"
      />
      <div className="earth-topbar">
        <div>
          <p>OpenClaw Monorepo</p>
          <h1>Project Sphere</h1>
          <div className="repo-count" aria-label={`${projects.length} repos indexed`}>
            <strong>{projects.length}</strong>
            <span>repos indexed on the purple planet</span>
          </div>
        </div>
        <div className="earth-controls">
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(-0.34)}>
            <ZoomIn size={18} />
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(0.34)}>
            <ZoomOut size={18} />
          </button>
          <button type="button" aria-label="Reset globe" onClick={resetView}>
            <RotateCcw size={18} />
          </button>
        </div>
      </div>
      <div className="project-strip" aria-label="Projects">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            data-project-id={project.id}
            className={project.id === activeProjectId ? "is-active" : ""}
            onClick={() => selectProject(project.id)}
          >
            <span style={{ backgroundColor: project.color }} />
            {project.shortLabel}
          </button>
        ))}
      </div>
      {activeProject && activeDetail ? (
        <aside className="project-popover" aria-label={`${activeProject.shortLabel} project details`}>
          <button
            type="button"
            className="project-popover__close"
            aria-label="Close project details"
            onClick={() => setDetailProjectId(null)}
          >
            <X size={16} />
          </button>
          <div className={`project-picture project-picture--${activeDetail.preview}`} aria-hidden="true">
            <span />
            <i />
          </div>
          <div className="project-popover__body">
            <p className="project-popover__eyebrow">{activeDetail.eyebrow}</p>
            <h2>{activeDetail.title}</h2>
            <p>{activeProject.summary}</p>
            <dl className="project-build">
              <div>
                <dt>Last built upon</dt>
                <dd>{activeDetail.lastBuilt}</dd>
              </div>
              <div>
                <dt>Commit</dt>
                <dd>{activeDetail.commit}</dd>
              </div>
              <div>
                <dt>What it had</dt>
                <dd>{activeDetail.commitSummary}</dd>
              </div>
            </dl>
            {activeProject.id === "unity-rpg" ? (
              <button type="button" className="project-popover__action" onClick={() => setIsRpgOpen(true)}>
                <Gamepad2 size={16} />
                Open RPG
              </button>
            ) : null}
          </div>
        </aside>
      ) : null}
      {isRpgOpen ? (
        <div className="rpg-overlay" role="dialog" aria-modal="true" aria-labelledby="rpg-overlay-title">
          <button
            type="button"
            className="rpg-overlay__scrim"
            aria-label="Close RPG overlay"
            onClick={() => setIsRpgOpen(false)}
          />
          <section className="rpg-overlay__panel">
            <header className="rpg-overlay__header">
              <div>
                <p>Game Surface</p>
                <h2 id="rpg-overlay-title">
                  <Gamepad2 size={18} />
                  FF6 Inspired RPG
                </h2>
              </div>
              <button type="button" aria-label="Close RPG overlay" onClick={() => setIsRpgOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <iframe
              className="rpg-overlay__frame"
              title="FF6 Inspired RPG"
              src="/unity-rpg?embed=1"
              loading="lazy"
              allow="fullscreen; gamepad"
            />
          </section>
        </div>
      ) : null}
      <script
        id="project-fallback-data"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(fallbackProjectData) }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
(() => {
  window.setTimeout(() => {
    if (document.querySelector(".earth-canvas canvas")) return;
    const root = document.querySelector(".earth-shell");
    const dataNode = document.getElementById("project-fallback-data");
    if (!root || !dataNode) return;
    const projects = JSON.parse(dataNode.textContent || "[]");
    const byId = new Map(projects.map((project) => [project.id, project]));

    const text = (tag, value, className) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      element.textContent = value || "";
      return element;
    };

    const showProject = (projectId) => {
      const project = byId.get(projectId);
      if (!project || !project.detail) return;
      root.querySelector(".project-popover--fallback")?.remove();
      root.querySelectorAll(".project-strip button").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.projectId === projectId);
      });

      const panel = document.createElement("aside");
      panel.className = "project-popover project-popover--fallback";
      panel.setAttribute("aria-label", project.shortLabel + " project details");

      const close = document.createElement("button");
      close.type = "button";
      close.className = "project-popover__close";
      close.setAttribute("aria-label", "Close project details");
      close.textContent = "X";
      close.addEventListener("click", () => panel.remove());

      const picture = document.createElement("div");
      picture.className = "project-picture project-picture--" + project.detail.preview;
      picture.setAttribute("aria-hidden", "true");
      picture.append(document.createElement("span"), document.createElement("i"));

      const body = document.createElement("div");
      body.className = "project-popover__body";
      body.append(
        text("p", project.detail.eyebrow, "project-popover__eyebrow"),
        text("h2", project.detail.title),
        text("p", project.summary)
      );

      const build = document.createElement("dl");
      build.className = "project-build";
      [
        ["Last built upon", project.detail.lastBuilt],
        ["Commit", project.detail.commit],
        ["What it had", project.detail.commitSummary]
      ].forEach(([label, value]) => {
        const row = document.createElement("div");
        row.append(text("dt", label), text("dd", value));
        build.append(row);
      });
      body.append(build);

      if (project.id === "unity-rpg") {
        const link = document.createElement("a");
        link.className = "project-popover__action";
        link.href = "/unity-rpg";
        link.textContent = "Open RPG";
        body.append(link);
      }

      panel.append(close, picture, body);
      root.append(panel);
    };

    root.querySelectorAll(".project-strip button[data-project-id]").forEach((button) => {
      button.addEventListener("click", () => showProject(button.dataset.projectId));
    });
  }, 1200);
})();
          `
        }}
      />
    </main>
  );
}

function latLonToVector(lat: number, lon: number, radius: number) {
  const latRad = THREE.MathUtils.degToRad(lat);
  const lonRad = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    radius * Math.cos(latRad) * Math.sin(lonRad),
    radius * Math.sin(latRad),
    radius * Math.cos(latRad) * Math.cos(lonRad)
  );
}

function createStarField() {
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const radius = 18 + Math.random() * 12;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[index * 3 + 2] = radius * Math.cos(phi);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: "#ffffff",
    size: 0.018,
    transparent: true,
    opacity: 0.72
  });
  return new THREE.Points(geometry, material);
}

function createPurplePlanetTexture() {
  const random = seededRandom(1337);
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create purple planet texture.");
  }

  const base = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  base.addColorStop(0, "#130821");
  base.addColorStop(0.28, "#2c1557");
  base.addColorStop(0.52, "#4c1d95");
  base.addColorStop(0.76, "#24104f");
  base.addColorStop(1, "#070816");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 58; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = 80 + random() * 280;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(${160 + random() * 70}, ${100 + random() * 70}, 255, 0.2)`);
    glow.addColorStop(1, "rgba(20, 8, 34, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "screen";
  for (let band = 0; band < 18; band += 1) {
    ctx.beginPath();
    ctx.strokeStyle = band % 3 === 0 ? "rgba(125, 211, 252, 0.18)" : "rgba(216, 180, 254, 0.13)";
    ctx.lineWidth = 2 + random() * 4;
    const y = (band / 18) * canvas.height + Math.sin(band) * 24;
    ctx.moveTo(0, y);
    for (let x = 0; x <= canvas.width; x += 80) {
      ctx.lineTo(x, y + Math.sin(x * 0.006 + band) * (18 + band * 0.8));
    }
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "multiply";
  const vignette = ctx.createRadialGradient(
    canvas.width * 0.48,
    canvas.height * 0.42,
    canvas.width * 0.08,
    canvas.width * 0.5,
    canvas.height * 0.5,
    canvas.width * 0.62
  );
  vignette.addColorStop(0, "rgba(255,255,255,0)");
  vignette.addColorStop(0.68, "rgba(50,12,90,0.22)");
  vignette.addColorStop(1, "rgba(0,0,0,0.64)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalCompositeOperation = "source-over";
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const noise = random() * 18 - 9;
    imageData.data[index] += noise;
    imageData.data[index + 1] += noise;
    imageData.data[index + 2] += noise;
  }
  ctx.putImageData(imageData, 0, 0);

  return new THREE.CanvasTexture(canvas);
}

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    for (const item of material) {
      item.dispose();
    }
    return;
  }

  material.dispose();
}
