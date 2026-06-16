"use client";

import { repoNodes } from "@agent/repo-graph";
import { Gamepad2, RotateCcw, X, ZoomOut } from "lucide-react";
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

type CameraMove = {
  startCamera: THREE.Vector3;
  startLookAt: THREE.Vector3;
  targetCamera: THREE.Vector3;
  targetLookAt: THREE.Vector3;
  startedAt: number;
  durationMs: number;
  revealProjectId?: string;
  hasRevealedDetail: boolean;
};

const projectLocations: Record<string, Pick<GlobeProject, "lat" | "lon" | "color">> = {
  web: { lat: 8, lon: -72, color: "#9f7aea" },
  "crypto-trader": { lat: 46, lon: -26, color: "#22c55e" },
  "crypto-tax": { lat: -8, lon: -34, color: "#14b8a6" },
  ui: { lat: 24, lon: 42, color: "#67e8f9" },
  "repo-graph": { lat: -12, lon: 116, color: "#facc15" },
  "unity-rpg": { lat: -42, lon: -66, color: "#fb7185" },
  dbt: { lat: -18, lon: 10, color: "#34d399" },
  seeds: { lat: -50, lon: 76, color: "#2dd4bf" },
  docs: { lat: 54, lon: 138, color: "#f8fafc" }
};

const atmosphereVertexShader = `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const atmosphereFragmentShader = `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float edge = 1.0 - max(dot(normalize(vWorldNormal), viewDirection), 0.0);
    float rim = smoothstep(0.28, 0.96, pow(edge, 1.45));
    float feather = smoothstep(0.12, 0.44, edge);
    float alpha = rim * feather * 0.44;
    vec3 color = mix(vec3(0.42, 0.82, 1.0), vec3(0.84, 0.52, 1.0), rim);

    gl_FragColor = vec4(color, alpha);
  }
`;

const projectDetails: Record<string, ProjectDetail> = {
  web: {
    eyebrow: "Next.js app",
    title: "OpenClaw Atlas web surface",
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
  "crypto-tax": {
    eyebrow: "SaaS prototype",
    title: "Sweden crypto tax workbench",
    preview: "analytics",
    lastBuilt: "2026-06-16 workspace build",
    commit: "workspace draft",
    commitSummary: "Adds a Sweden-first crypto tax calculator app with CSV import, average-cost tracking, and K4-style disposal summaries."
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

const getDefaultCameraPosition = () => {
  if (typeof window === "undefined") {
    return new THREE.Vector3(0, 0.35, 3.45);
  }

  const isClassicSeViewport = window.matchMedia(
    "(width: 320px) and (height: 568px) and (-webkit-device-pixel-ratio: 2), (width: 320px) and (height: 568px) and (resolution: 2dppx), (device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)"
  ).matches;

  if (isClassicSeViewport) {
    return new THREE.Vector3(0, 0.2, 4.65);
  }

  if (window.matchMedia("(max-width: 380px) and (max-height: 700px)").matches) {
    return new THREE.Vector3(0, 0.24, 4.35);
  }

  return new THREE.Vector3(0, 0.35, 3.45);
};

export function EarthGlobe({ initialOpenProjectId }: { initialOpenProjectId?: string }) {
  const initialProjectId =
    initialOpenProjectId && projectLocations[initialOpenProjectId] ? initialOpenProjectId : "web";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const targetCameraRef = useRef<THREE.Vector3 | null>(null);
  const targetLookAtRef = useRef<THREE.Vector3 | null>(null);
  const cameraMoveRef = useRef<CameraMove | null>(null);
  const cameraSpinVelocityRef = useRef(new THREE.Vector2());
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

  const focusProject = useCallback((projectId: string, revealDetail = false) => {
    const marker = markerRefs.current.get(projectId);
    if (!marker) {
      return;
    }

    setActiveProjectId(projectId);
    cameraSpinVelocityRef.current.set(0, 0);
    const surface = marker.position.clone().normalize();
    const targetCamera = surface.clone().multiplyScalar(1.92);
    const targetLookAt = new THREE.Vector3(0, 0, 0);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    targetCameraRef.current = null;
    targetLookAtRef.current = null;

    if (!camera || !controls) {
      targetCameraRef.current = targetCamera;
      targetLookAtRef.current = targetLookAt;
      if (revealDetail) {
        setDetailProjectId(projectId);
      }
      return;
    }

    cameraMoveRef.current = {
      startCamera: camera.position.clone(),
      startLookAt: controls.target.clone(),
      targetCamera,
      targetLookAt,
      startedAt: performance.now(),
      durationMs: 1450,
      revealProjectId: revealDetail ? projectId : undefined,
      hasRevealedDetail: false
    };
  }, []);

  const selectProject = useCallback(
    (projectId: string) => {
      setDetailProjectId(null);
      focusProject(projectId, true);
    },
    [focusProject]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    hasRenderedFrameRef.current = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#02030a");

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.copy(getDefaultCameraPosition());
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
        emissiveIntensity: 0.4
      })
    );
    earth.rotation.y = -0.34;
    scene.add(earth);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.022, 96, 96),
      new THREE.ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide
      })
    );
    scene.add(atmosphere);

    const andromeda = createAndromedaBackdrop();
    scene.add(andromeda);

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
    const cameraSpinVelocity = cameraSpinVelocityRef.current;
    const activeTouchPointers = new Map<number, THREE.Vector2>();
    const touchStart = new THREE.Vector2();
    const touchCurrent = new THREE.Vector2();
    let hasTouchDrag = false;
    let lastPinchDistance: number | null = null;
    let lastTouchMoveTime: number | null = null;
    let previousFrameTime = performance.now();

    const clearTargetCamera = () => {
      targetCameraRef.current = null;
      targetLookAtRef.current = null;
      cameraMoveRef.current = null;
    };

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const selectMarkerAt = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...markers.values()]);
      const hit = hits[0]?.object;
      if (hit?.userData.projectId) {
        selectProject(hit.userData.projectId as string);
      }
    };

    const applyCameraRotation = (thetaDelta: number, phiDelta: number, clearTarget = true) => {
      if (clearTarget) {
        clearTargetCamera();
      }

      const target = controls.target.clone();
      const offset = camera.position.clone().sub(target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta += thetaDelta;
      spherical.phi += phiDelta;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.22, Math.PI - 0.22);
      spherical.makeSafe();
      camera.position.copy(target.clone().add(new THREE.Vector3().setFromSpherical(spherical)));
      camera.lookAt(target);
      controls.update();
    };

    const rotateCamera = (deltaX: number, deltaY: number, eventTime: number) => {
      const thetaDelta = -deltaX * 0.006;
      const phiDelta = -deltaY * 0.006;
      applyCameraRotation(thetaDelta, phiDelta);

      if (lastTouchMoveTime !== null) {
        const deltaSeconds = THREE.MathUtils.clamp((eventTime - lastTouchMoveTime) / 1000, 0.008, 0.08);
        const nextThetaVelocity = thetaDelta / deltaSeconds;
        const nextPhiVelocity = phiDelta / deltaSeconds;
        cameraSpinVelocity.x = THREE.MathUtils.lerp(cameraSpinVelocity.x, nextThetaVelocity, 0.42);
        cameraSpinVelocity.y = THREE.MathUtils.lerp(cameraSpinVelocity.y, nextPhiVelocity, 0.42);
        cameraSpinVelocity.clampLength(0, 4.6);
      }

      lastTouchMoveTime = eventTime;
    };

    const zoomCamera = (amount: number) => {
      clearTargetCamera();
      cameraSpinVelocity.set(0, 0);
      const direction = camera.position.clone().sub(controls.target).normalize();
      const distance = camera.position.distanceTo(controls.target);
      const nextDistance = THREE.MathUtils.clamp(distance + amount, controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target.clone().add(direction.multiplyScalar(nextDistance)));
      controls.update();
    };

    const getTouchPointerDistance = () => {
      const points = [...activeTouchPointers.values()];
      if (points.length < 2) {
        return null;
      }
      return points[0].distanceTo(points[1]);
    };

    const handleTouchPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      clearTargetCamera();
      cameraSpinVelocity.set(0, 0);
      controls.enabled = false;
      touchStart.set(event.clientX, event.clientY);
      touchCurrent.copy(touchStart);
      hasTouchDrag = false;
      lastTouchMoveTime = event.timeStamp;
      activeTouchPointers.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
      try {
        renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic and older mobile browser events can reject capture; window-level handlers still keep drag alive.
      }
      lastPinchDistance = getTouchPointerDistance();
    };

    const handleTouchPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !activeTouchPointers.has(event.pointerId)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      const previous = activeTouchPointers.get(event.pointerId);
      if (!previous) {
        return;
      }

      const deltaX = event.clientX - previous.x;
      const deltaY = event.clientY - previous.y;
      previous.set(event.clientX, event.clientY);
      touchCurrent.set(event.clientX, event.clientY);

      if (activeTouchPointers.size > 1) {
        const nextPinchDistance = getTouchPointerDistance();
        if (lastPinchDistance !== null && nextPinchDistance !== null) {
          zoomCamera((lastPinchDistance - nextPinchDistance) * 0.006);
          hasTouchDrag = true;
        }
        lastPinchDistance = nextPinchDistance;
        lastTouchMoveTime = event.timeStamp;
        return;
      }

      if (Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) > 4) {
        hasTouchDrag = true;
      }
      rotateCamera(deltaX, deltaY, event.timeStamp);
    };

    const handleTouchPointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !activeTouchPointers.has(event.pointerId)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      activeTouchPointers.delete(event.pointerId);
      try {
        if (renderer.domElement.hasPointerCapture?.(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Capture may already be gone if Safari cancelled the touch.
      }

      if (activeTouchPointers.size === 0) {
        controls.enabled = true;
        lastPinchDistance = null;
        lastTouchMoveTime = null;
        if (!hasTouchDrag) {
          cameraSpinVelocity.set(0, 0);
          selectMarkerAt(touchCurrent.x, touchCurrent.y);
        }
      } else {
        lastPinchDistance = getTouchPointerDistance();
        lastTouchMoveTime = event.timeStamp;
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        return;
      }

      clearTargetCamera();
      cameraSpinVelocity.set(0, 0);
      selectMarkerAt(event.clientX, event.clientY);
    };

    const preventSafariTouchScroll = (event: TouchEvent) => {
      event.preventDefault();
    };

    const animate = () => {
      const now = performance.now();
      const deltaSeconds = THREE.MathUtils.clamp((now - previousFrameTime) / 1000, 0.001, 0.05);
      previousFrameTime = now;
      const cameraMove = cameraMoveRef.current;
      const targetCamera = targetCameraRef.current;
      const targetLookAt = targetLookAtRef.current;
      if (cameraMove) {
        const progress = THREE.MathUtils.clamp((now - cameraMove.startedAt) / cameraMove.durationMs, 0, 1);
        const easedProgress = easeInOutCubic(progress);
        camera.position.copy(cameraMove.startCamera).lerp(cameraMove.targetCamera, easedProgress);
        controls.target.copy(cameraMove.startLookAt).lerp(cameraMove.targetLookAt, easedProgress);

        if (cameraMove.revealProjectId && !cameraMove.hasRevealedDetail && progress >= 0.86) {
          cameraMove.hasRevealedDetail = true;
          setDetailProjectId(cameraMove.revealProjectId);
        }

        if (progress >= 1) {
          cameraMoveRef.current = null;
        }
      } else if (targetCamera && targetLookAt) {
        camera.position.lerp(targetCamera, 0.075);
        controls.target.lerp(targetLookAt, 0.075);
        if (camera.position.distanceTo(targetCamera) < 0.01) {
          targetCameraRef.current = null;
          targetLookAtRef.current = null;
        }
      } else if (cameraSpinVelocity.lengthSq() > 0.000001) {
        applyCameraRotation(cameraSpinVelocity.x * deltaSeconds, cameraSpinVelocity.y * deltaSeconds, false);
        const damping = Math.pow(0.955, deltaSeconds * 60);
        cameraSpinVelocity.multiplyScalar(damping);
        if (cameraSpinVelocity.lengthSq() < 0.00001) {
          cameraSpinVelocity.set(0, 0);
        }
      }

      earth.rotation.y += 0.00055;
      atmosphere.rotation.y += 0.00055;
      andromeda.rotation.z += 0.000006;
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
    renderer.domElement.addEventListener("pointerdown", handleTouchPointerDown, { capture: true });
    renderer.domElement.addEventListener("pointermove", handleTouchPointerMove, { capture: true });
    renderer.domElement.addEventListener("pointerup", handleTouchPointerEnd, { capture: true });
    renderer.domElement.addEventListener("pointercancel", handleTouchPointerEnd, { capture: true });
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handleTouchPointerMove, { capture: true });
    window.addEventListener("pointerup", handleTouchPointerEnd, { capture: true });
    window.addEventListener("pointercancel", handleTouchPointerEnd, { capture: true });
    renderer.domElement.addEventListener("touchstart", preventSafariTouchScroll, { passive: false });
    renderer.domElement.addEventListener("touchmove", preventSafariTouchScroll, { passive: false });

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", handleTouchPointerDown, { capture: true });
      renderer.domElement.removeEventListener("pointermove", handleTouchPointerMove, { capture: true });
      renderer.domElement.removeEventListener("pointerup", handleTouchPointerEnd, { capture: true });
      renderer.domElement.removeEventListener("pointercancel", handleTouchPointerEnd, { capture: true });
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handleTouchPointerMove, { capture: true });
      window.removeEventListener("pointerup", handleTouchPointerEnd, { capture: true });
      window.removeEventListener("pointercancel", handleTouchPointerEnd, { capture: true });
      renderer.domElement.removeEventListener("touchstart", preventSafariTouchScroll);
      renderer.domElement.removeEventListener("touchmove", preventSafariTouchScroll);
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
      andromeda.geometry.dispose();
      disposeMaterial(andromeda.material);
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

    cameraMoveRef.current = null;
    targetCameraRef.current = null;
    targetLookAtRef.current = null;
    const direction = camera.position.clone().sub(controls.target).normalize();
    const distance = camera.position.distanceTo(controls.target);
    const nextDistance = THREE.MathUtils.clamp(distance + amount, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target.clone().add(direction.multiplyScalar(nextDistance)));
  };

  const resetView = () => {
    const targetCamera = getDefaultCameraPosition();
    const targetLookAt = new THREE.Vector3(0, 0, 0);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    targetCameraRef.current = null;
    targetLookAtRef.current = null;
    cameraMoveRef.current =
      camera && controls
        ? {
            startCamera: camera.position.clone(),
            startLookAt: controls.target.clone(),
            targetCamera,
            targetLookAt,
            startedAt: performance.now(),
            durationMs: 1050,
            hasRevealedDetail: true
          }
        : null;
    if (!camera || !controls) {
      targetCameraRef.current = targetCamera;
      targetLookAtRef.current = targetLookAt;
    }
    setActiveProjectId("web");
    setDetailProjectId(null);
    setIsRpgOpen(false);
  };

  return (
    <main className="earth-shell">
      <div
        ref={containerRef}
        className={`earth-canvas ${isCanvasReady ? "earth-canvas--ready" : ""}`}
        aria-label="Interactive 3D OpenClaw Atlas"
      />
      <div className="earth-topbar">
        <div>
          <p>Monorepo built by OpenClaw</p>
          <h1>OpenClaw Atlas</h1>
          <div className="repo-count" aria-label={`${projects.length} repos indexed`}>
            <strong>{projects.length}</strong>
            <span>repos mapped</span>
          </div>
        </div>
        <div className="earth-controls">
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

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
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

function createAndromedaBackdrop() {
  const random = seededRandom(4242);
  const count = 520;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const progress = random();
    const arm = Math.floor(random() * 4);
    const angle = progress * Math.PI * 2.2 + arm * Math.PI * 0.5 + (random() - 0.5) * 0.32;
    const radius = 0.08 + Math.pow(progress, 0.72) * 2.35;
    const scatter = (random() - 0.5) * 0.28;
    const x = Math.cos(angle) * (radius + scatter);
    const y = Math.sin(angle) * (radius * 0.34 + scatter * 0.16);
    const z = (random() - 0.5) * 0.04;
    const falloff = 1 - Math.min(radius / 2.55, 1);
    const tint = random() > 0.52 ? "#93c5fd" : "#c4b5fd";
    base.set(tint).multiplyScalar(0.2 + falloff * 0.42 + random() * 0.1);

    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
    colors[index * 3] = base.r;
    colors[index * 3 + 1] = base.g;
    colors[index * 3 + 2] = base.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.026,
    sizeAttenuation: true,
    vertexColors: true,
    depthTest: true,
    depthWrite: false
  });

  const galaxy = new THREE.Points(geometry, material);
  galaxy.position.set(2.85, 1.02, -8.4);
  galaxy.scale.set(1.35, 1.35, 1);
  galaxy.rotation.z = -0.24;
  galaxy.rotation.y = -0.12;
  return galaxy;
}

function createPurplePlanetTexture() {
  const random = seededRandom(1337);
  const canvas = document.createElement("canvas");
  const width = 2048;
  const height = 1024;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create purple planet texture.");
  }

  const imageData = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    const vertical = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const theta = (x / width) * Math.PI * 2;
      const haze =
        0.5 +
        0.5 *
          (Math.sin(theta * 2 + vertical * 5.2) * 0.46 +
            Math.sin(theta * 5 - vertical * 8.1) * 0.28 +
            Math.cos(theta * 9 + vertical * 2.4) * 0.16);
      const latitudeGlow = Math.sin(vertical * Math.PI);
      const index = (y * width + x) * 4;
      imageData.data[index] = 19 + haze * 28 + latitudeGlow * 36;
      imageData.data[index + 1] = 8 + haze * 16 + latitudeGlow * 12;
      imageData.data[index + 2] = 34 + haze * 74 + latitudeGlow * 132;
      imageData.data[index + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  for (let index = 0; index < 58; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const radius = 80 + random() * 280;
    const glowColor = `rgba(${160 + random() * 70}, ${100 + random() * 70}, 255, 0.16)`;
    for (const offset of [-width, 0, width]) {
      const glow = ctx.createRadialGradient(x + offset, y, 0, x + offset, y, radius);
      glow.addColorStop(0, glowColor);
      glow.addColorStop(1, "rgba(20, 8, 34, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x + offset, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = "screen";
  for (let band = 0; band < 18; band += 1) {
    ctx.beginPath();
    ctx.strokeStyle = band % 3 === 0 ? "rgba(125, 211, 252, 0.18)" : "rgba(216, 180, 254, 0.13)";
    ctx.lineWidth = 2 + random() * 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const y = (band / 18) * height + Math.sin(band) * 24;
    ctx.moveTo(-48, y);
    for (let x = -48; x <= width + 48; x += 24) {
      const theta = (x / width) * Math.PI * 2;
      const wave =
        Math.sin(theta * 2 + band) * (13 + band * 0.5) +
        Math.sin(theta * 5 - band * 0.7) * (5 + band * 0.18);
      ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "multiply";
  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.42,
    width * 0.08,
    width * 0.5,
    height * 0.5,
    width * 0.62
  );
  vignette.addColorStop(0, "rgba(255,255,255,0)");
  vignette.addColorStop(0.68, "rgba(50,12,90,0.14)");
  vignette.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = "source-over";
  const leftEdge = ctx.getImageData(0, 0, 1, height);
  ctx.putImageData(leftEdge, width - 1, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
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
