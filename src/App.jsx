import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Canvas, useThree } from "@react-three/fiber";

import {
  Environment,
  OrbitControls,
  TransformControls,
  useGLTF,
  Html,
} from "@react-three/drei";

import * as THREE from "three";

import "./App.css";

/* =========================================================
   CONSTANTS & BOUNDS
   House is 32 × 36 ft (~9.75 × 10.97 m).
   Centered coordinates: X in [-4.87, 4.87], Z in [-5.48, 5.48].
   Interior usable bounds for furniture placement:
========================================================= */

const BOUNDS = {
  HALF_WIDTH: 3.9,
  HALF_LENGTH: 4.5,
};

const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const centerNDC = new THREE.Vector2(0, 0);
const tempHit = new THREE.Vector3();

function getCameraFloorIntersection(camera) {
  if (!camera) return [0, 0, 0];
  raycaster.setFromCamera(centerNDC, camera);
  const hit = raycaster.ray.intersectPlane(floorPlane, tempHit);
  if (hit) {
    const x = THREE.MathUtils.clamp(
      tempHit.x,
      -BOUNDS.HALF_WIDTH,
      BOUNDS.HALF_WIDTH
    );
    const z = THREE.MathUtils.clamp(
      tempHit.z,
      -BOUNDS.HALF_LENGTH,
      BOUNDS.HALF_LENGTH
    );
    return [x, 0, z];
  }
  return [0, 0, 0];
}

const WALL_PALETTE = [
  { name: "Pure White", color: "#FFFFFF" },
  { name: "Off White", color: "#F3F4F6" },
  { name: "Warm Alabaster", color: "#FBF7EE" },
  { name: "Soft Greige", color: "#D5CFC4" },
  { name: "Muted Slate", color: "#94A3B8" },
  { name: "Charcoal", color: "#475569" },
  { name: "Midnight Navy", color: "#1E293B" },
  { name: "Sage Green", color: "#849974" },
  { name: "Forest Green", color: "#3F5E4D" },
  { name: "Dusty Rose", color: "#C48B9F" },
  { name: "Terracotta", color: "#B45309" },
  { name: "Sky Blue", color: "#93C5FD" },
];

/* Helper to identify customizable wall meshes vs doors/windows/lintels/floors */
function isEditableWall(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  // Filter out non-customizable targets: lintels, floors, texts, camera
  if (
    n.includes("lintel") ||
    n.includes("floor") ||
    n.includes("text") ||
    n.includes("cam")
  ) {
    return false;
  }
  return n.startsWith("div_") || n.startsWith("wrap_") || n.startsWith("ext_");
}

/* Helper to convert mesh names into clean human-readable labels */
function formatWallName(name) {
  if (!name) return "Wall";
  const nameMap = {
    Div_H_Kit_Toilet: "Kitchen / Toilet Partition",
    Div_H_Right_Bed: "Bedroom Partition Wall",
    Div_H_Right_Hall: "Living Hall Partition",
    Div_V_Bot_Hall: "Hallway Inner Wall",
    Div_V_Bot_Kit: "Kitchen Inner Wall",
    Div_V_Top_Bed: "Bedroom Divider 1",
    Div_V_Top_Bed_2: "Bedroom Divider 2",
    Div_V_Top_Toilet: "Toilet Partition Wall",
    Ext_Bot_HallSide: "Exterior South Wall (Hall)",
    Ext_Bot_KitSide: "Exterior South Wall (Kitchen)",
    Ext_Left: "Exterior West Wall",
    Ext_Right: "Exterior East Wall",
    Ext_Top: "Exterior North Wall",
    Wrap_Bed_Right: "Bedroom East Wall",
    Wrap_Bed_Top: "Bedroom North Wall",
    Wrap_Hall_Bot1: "Living Room South Wall 1",
    Wrap_Hall_Bot2: "Living Room South Wall 2",
    Wrap_Hall_Right: "Living Room East Wall",
    Wrap_Kit_Bot: "Kitchen South Wall",
    Wrap_Kit_Left: "Kitchen West Wall",
  };
  return nameMap[name] || name.replace(/_/g, " ");
}

/* =========================================================
   HOUSE MODEL COMPONENT
========================================================= */

function HouseModel({
  wallColors,
  selectedWall,
  onSelectWall,
  placementMode,
}) {
  const { scene } = useGLTF("/models/house.glb");

  const { model, wallMeshes } = useMemo(() => {
    const cloned = scene.clone(true);

    const box = new THREE.Box3().setFromObject(cloned);
    const center = box.getCenter(new THREE.Vector3());

    cloned.position.set(-center.x, -box.min.y, -center.z);

    const meshes = {};

    cloned.traverse((child) => {
      if (!child.isMesh) return;

      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.housePart = true;

      const name = child.name || "";
      if (isEditableWall(name)) {
        child.userData.editableWall = true;
        // Clone material per mesh so each wall surface has an independent material instance
        if (child.material) {
          child.material = child.material.clone();
          child.userData.initialColor = child.material.color.clone();
        }
        meshes[name] = child;
      } else {
        child.userData.editableWall = false;
      }
    });

    return { model: cloned, wallMeshes: meshes };
  }, [scene]);

  // Sync wall colors and selection highlights
  useEffect(() => {
    Object.entries(wallMeshes).forEach(([name, mesh]) => {
      if (!mesh || !mesh.material) return;

      // Apply custom or default color
      if (wallColors[name]) {
        mesh.material.color.set(wallColors[name]);
      } else if (mesh.userData.initialColor) {
        mesh.material.color.copy(mesh.userData.initialColor);
      }

      // Visual highlight for selected wall
      if (selectedWall === name) {
        mesh.material.emissive = new THREE.Color("#38bdf8");
        mesh.material.emissiveIntensity = 0.35;
      } else {
        mesh.material.emissive = new THREE.Color(0, 0, 0);
        mesh.material.emissiveIntensity = 0;
      }
    });
  }, [wallColors, selectedWall, wallMeshes]);

  const pointerDownPosRef = useRef(null);

  const handlePointerDown = (event) => {
    if (placementMode) return;

    const target = event.object;
    if (target && target.userData?.editableWall) {
      pointerDownPosRef.current = {
        x: event.clientX,
        y: event.clientY,
        targetName: target.name,
      };
    } else {
      pointerDownPosRef.current = null;
    }
  };

  const handlePointerUp = (event) => {
    if (placementMode) return;
    if (!pointerDownPosRef.current) return;

    const { x, y, targetName } = pointerDownPosRef.current;
    pointerDownPosRef.current = null;

    const dx = event.clientX - x;
    const dy = event.clientY - y;
    const dist = Math.hypot(dx, dy);

    // If movement is smaller than 10px, treat as stationary click/tap
    if (dist < 10) {
      event.stopPropagation();
      onSelectWall(targetName);
    }
  };

  const handlePointerCancel = () => {
    pointerDownPosRef.current = null;
  };

  return (
    <primitive
      object={model}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    />
  );
}

useGLTF.preload("/models/house.glb");

/* =========================================================
   TEMPORARY SOFA PROCEDURAL GEOMETRY
========================================================= */

function SofaModel({ ghost = false }) {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: ghost ? "#38bdf8" : "#6b7280",
        transparent: ghost,
        opacity: ghost ? 0.45 : 1,
        roughness: 0.8,
      }),
    [ghost]
  );

  const darkMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: ghost ? "#0284c7" : "#374151",
        transparent: ghost,
        opacity: ghost ? 0.4 : 1,
        roughness: 0.85,
      }),
    [ghost]
  );

  return (
    <group>
      {/* Seat */}
      <mesh
        position={[0, 0.65, 0]}
        material={material}
        castShadow={!ghost}
        raycast={ghost ? () => null : undefined}
      >
        <boxGeometry args={[3.2, 0.7, 1.35]} />
      </mesh>

      {/* Back */}
      <mesh
        position={[0, 1.45, -0.52]}
        material={material}
        castShadow={!ghost}
        raycast={ghost ? () => null : undefined}
      >
        <boxGeometry args={[3.2, 1.35, 0.35]} />
      </mesh>

      {/* Left arm */}
      <mesh
        position={[-1.48, 1.0, 0]}
        material={material}
        castShadow={!ghost}
        raycast={ghost ? () => null : undefined}
      >
        <boxGeometry args={[0.3, 0.85, 1.4]} />
      </mesh>

      {/* Right arm */}
      <mesh
        position={[1.48, 1.0, 0]}
        material={material}
        castShadow={!ghost}
        raycast={ghost ? () => null : undefined}
      >
        <boxGeometry args={[0.3, 0.85, 1.4]} />
      </mesh>

      {/* Legs */}
      {[
        [-1.15, 0.25, -0.45],
        [1.15, 0.25, -0.45],
        [-1.15, 0.25, 0.45],
        [1.15, 0.25, 0.45],
      ].map((pos, i) => (
        <mesh
          key={i}
          position={pos}
          material={darkMaterial}
          castShadow={!ghost}
          raycast={ghost ? () => null : undefined}
        >
          <boxGeometry args={[0.16, 0.5, 0.16]} />
        </mesh>
      ))}
    </group>
  );
}

/* =========================================================
   PLACEMENT PREVIEW (GHOST + GROUND RING)
========================================================= */

function PlacementPreview({ active, position }) {
  if (!active) return null;

  return (
    <group position={position}>
      {/* Ghost sofa */}
      <SofaModel ghost />

      {/* Floor guide ring */}
      <mesh
        position={[0, 0.025, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => null}
      >
        <ringGeometry args={[1.75, 1.95, 48]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.85}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Subtle center spot */}
      <mesh
        position={[0, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => null}
      >
        <circleGeometry args={[0.2, 24]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/* =========================================================
   PLACEMENT SURFACE (RAYCASTING FLOOR PLANE)
========================================================= */

function PlacementSurface({
  placementMode,
  onFloorHover,
  onMove,
  onRegisterCamera,
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (onRegisterCamera) {
      onRegisterCamera(camera);
    }
  }, [camera, onRegisterCamera]);

  const handlePointerMove = (event) => {
    if (placementMode) {
      event.stopPropagation();
    }
    if (!event.point) return;

    // Clamp coordinates strictly to interior floor boundary
    const x = THREE.MathUtils.clamp(
      event.point.x,
      -BOUNDS.HALF_WIDTH,
      BOUNDS.HALF_WIDTH
    );
    const z = THREE.MathUtils.clamp(
      event.point.z,
      -BOUNDS.HALF_LENGTH,
      BOUNDS.HALF_LENGTH
    );

    const pos = [x, 0, z];
    onFloorHover(pos);

    if (placementMode) {
      onMove(pos);
    }
  };

  const handlePointerDown = (event) => {
    if (!placementMode) return;
    event.stopPropagation();
    if (!event.point) return;

    const x = THREE.MathUtils.clamp(
      event.point.x,
      -BOUNDS.HALF_WIDTH,
      BOUNDS.HALF_WIDTH
    );
    const z = THREE.MathUtils.clamp(
      event.point.z,
      -BOUNDS.HALF_LENGTH,
      BOUNDS.HALF_LENGTH
    );

    const pos = [x, 0, z];
    onFloorHover(pos);
    onMove(pos);
  };

  return (
    <mesh
      position={[0, 0.01, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={handlePointerMove}
      onPointerDown={placementMode ? handlePointerDown : undefined}
    >
      <planeGeometry
        args={[BOUNDS.HALF_WIDTH * 2, BOUNDS.HALF_LENGTH * 2]}
      />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

/* =========================================================
   FURNITURE ITEM (WITH PERSISTENT TRANSFORMS)
========================================================= */

function FurnitureItem({
  item,
  selected,
  transformMode,
  onSelect,
  onUpdateTransform,
  setCameraLocked,
  orbitControlsRef,
}) {
  const [target, setTarget] = useState(null);
  const transformRef = useRef(null);

  // Sync Three.js transform with item props
  useEffect(() => {
    if (!target) return;
    target.position.set(...item.position);
    target.rotation.set(...item.rotation);
    target.scale.set(...item.scale);
  }, [target, item.position, item.rotation, item.scale]);

  // Hook up TransformControls events and lock OrbitControls
  useEffect(() => {
    const controls = transformRef.current;
    const orbitControls = orbitControlsRef?.current;
    if (!controls) return;

    const handleDraggingChanged = (event) => {
      const isDragging = Boolean(event.value);
      setCameraLocked(isDragging);

      if (orbitControls) {
        orbitControls.enabled = !isDragging;
      }

      // When drag ends, persist the updated transform to React state
      if (!isDragging && target) {
        const p = target.position;
        const r = target.rotation;
        const s = target.scale;

        onUpdateTransform(item.id, {
          position: [p.x, p.y, p.z],
          rotation: [r.x, r.y, r.z],
          scale: [s.x, s.y, s.z],
        });
      }
    };

    const handleObjectChange = () => {
      if (target) {
        const p = target.position;
        // Restrict furniture to interior bounds and floor level
        p.x = THREE.MathUtils.clamp(
          p.x,
          -BOUNDS.HALF_WIDTH,
          BOUNDS.HALF_WIDTH
        );
        p.z = THREE.MathUtils.clamp(
          p.z,
          -BOUNDS.HALF_LENGTH,
          BOUNDS.HALF_LENGTH
        );
        p.y = Math.max(0, p.y);
      }
    };

    controls.addEventListener("dragging-changed", handleDraggingChanged);
    controls.addEventListener("objectChange", handleObjectChange);

    return () => {
      controls.removeEventListener(
        "dragging-changed",
        handleDraggingChanged
      );
      controls.removeEventListener(
        "objectChange",
        handleObjectChange
      );
      setCameraLocked(false);
      if (orbitControls) {
        orbitControls.enabled = true;
      }
    };
  }, [selected, target, item.id, onUpdateTransform, setCameraLocked, orbitControlsRef]);

  return (
    <>
      {selected && target && (
        <TransformControls
          ref={transformRef}
          object={target}
          mode={transformMode}
          size={0.75}
          space="local"
        />
      )}

      <group
        ref={setTarget}
        position={item.position}
        rotation={item.rotation}
        scale={item.scale}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(item.id);
        }}
      >
        {item.type === "sofa" && <SofaModel />}
      </group>
    </>
  );
}

/* =========================================================
   LOADING SCREEN
========================================================= */

function LoadingScreen() {
  return (
    <Html center>
      <div className="loading-box">
        <div className="loading-spinner" />
        <span>Loading Architectural Scene...</span>
      </div>
    </Html>
  );
}

/* =========================================================
   SCENE CONTAINER
========================================================= */

function Scene({
  furniture,
  selectedFurniture,
  setSelectedFurniture,
  transformMode,
  placementMode,
  previewPosition,
  setPreviewPosition,
  onFloorHover,
  onRegisterCamera,
  cameraLocked,
  setCameraLocked,
  wallColors,
  selectedWall,
  setSelectedWall,
  onUpdateFurnitureTransform,
}) {
  const orbitControlsRef = useRef(null);

  return (
    <Canvas
      shadows
      camera={{
        position: [18, 14, 18],
        fov: 45,
        near: 0.1,
        far: 1000,
      }}
      gl={{
        antialias: true,
        logarithmicDepthBuffer: true,
      }}
      onPointerMissed={() => {
        if (!placementMode && !cameraLocked) {
          setSelectedFurniture(null);
          setSelectedWall(null);
        }
      }}
    >
      <color attach="background" args={["#101318"]} />

      <ambientLight intensity={1.5} />

      <directionalLight
        position={[12, 18, 20]}
        intensity={2.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0001}
      />

      <directionalLight
        position={[-12, 10, -12]}
        intensity={1.2}
      />

      <Suspense fallback={<LoadingScreen />}>
        {/* House Model with Wall Customization */}
        <HouseModel
          wallColors={wallColors}
          selectedWall={selectedWall}
          onSelectWall={(name) => {
            setSelectedWall(name);
            setSelectedFurniture(null);
          }}
          placementMode={placementMode}
        />

        {/* Furniture Items */}
        {furniture.map((item) => (
          <FurnitureItem
            key={item.id}
            item={item}
            selected={selectedFurniture === item.id}
            transformMode={transformMode}
            onSelect={(id) => {
              if (placementMode) return;
              setSelectedFurniture(id);
              setSelectedWall(null);
            }}
            onUpdateTransform={onUpdateFurnitureTransform}
            setCameraLocked={setCameraLocked}
            orbitControlsRef={orbitControlsRef}
          />
        ))}

        {/* Ghost Sofa Preview */}
        <PlacementPreview
          active={placementMode}
          position={previewPosition}
        />

        {/* Floor Raycasting Plane */}
        <PlacementSurface
          placementMode={placementMode}
          onFloorHover={onFloorHover}
          onMove={setPreviewPosition}
          onRegisterCamera={onRegisterCamera}
        />

        <Environment preset="city" />
      </Suspense>

      {/* 360° OrbitControls */}
      <OrbitControls
        ref={orbitControlsRef}
        makeDefault
        enabled={!cameraLocked && !placementMode}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.6}
        zoomSpeed={0.8}
        panSpeed={0.8}
        enableRotate
        enableZoom
        enablePan
        minDistance={1.5}
        maxDistance={120}
        minPolarAngle={0.01}
        maxPolarAngle={Math.PI - 0.05}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
      />
    </Canvas>
  );
}

/* =========================================================
   MAIN APP COMPONENT
========================================================= */

export default function App() {
  const [placementMode, setPlacementMode] = useState(false);
  const [previewPosition, setPreviewPosition] = useState([0, 0, 0]);

  const lastFloorPosRef = useRef(null);
  const cameraRef = useRef(null);

  const [furniture, setFurniture] = useState([]);
  const [selectedFurniture, setSelectedFurniture] = useState(null);
  const [transformMode, setTransformMode] = useState("translate");
  const [cameraLocked, setCameraLocked] = useState(false);

  const [selectedWall, setSelectedWall] = useState(null);
  const [wallColors, setWallColors] = useState({});

  const handleFloorHover = useCallback((pos) => {
    lastFloorPosRef.current = pos;
  }, []);

  const handleRegisterCamera = useCallback((camera) => {
    cameraRef.current = camera;
  }, []);

  /* --- Placement Handlers --- */

  const startSofaPlacement = () => {
    setSelectedFurniture(null);
    setSelectedWall(null);

    // 1. If we have a recent valid floor position, use it
    let initialPos = lastFloorPosRef.current;

    // 2. If no floor position tracked yet, raycast camera view center to interior floor plane
    if (!initialPos && cameraRef.current) {
      initialPos = getCameraFloorIntersection(cameraRef.current);
    }

    if (!initialPos) {
      initialPos = [0, 0, 0];
    }

    lastFloorPosRef.current = initialPos;
    setPreviewPosition(initialPos);
    setPlacementMode(true);
  };

  const addSofa = () => {
    if (!placementMode) return;
    const newSofa = {
      id: `sofa-${Date.now()}`,
      type: "sofa",
      position: [...previewPosition],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };

    setFurniture((prev) => [...prev, newSofa]);
    setPlacementMode(false);
    setCameraLocked(false);
    setSelectedFurniture(newSofa.id);
    setSelectedWall(null);
    setTransformMode("translate");
  };

  const cancelPlacement = useCallback(() => {
    setPlacementMode(false);
    setCameraLocked(false);
  }, []);

  /* --- Furniture Actions --- */

  const updateFurnitureTransform = useCallback((id, newTransform) => {
    setFurniture((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, ...newTransform } : item
      )
    );
  }, []);

  const deleteFurniture = useCallback(() => {
    if (!selectedFurniture) return;
    setFurniture((prev) =>
      prev.filter((item) => item.id !== selectedFurniture)
    );
    setSelectedFurniture(null);
  }, [selectedFurniture]);

  /* --- Wall Customization Actions --- */

  const handleWallColorChange = (color) => {
    if (!selectedWall) return;
    setWallColors((prev) => ({
      ...prev,
      [selectedWall]: color,
    }));
  };

  const handleResetWallColor = () => {
    if (!selectedWall) return;
    setWallColors((prev) => {
      const updated = { ...prev };
      delete updated[selectedWall];
      return updated;
    });
  };

  /* --- Keyboard Shortcuts --- */

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore when typing inside input fields
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        return;
      }

      if (e.key === "Escape") {
        if (placementMode) {
          cancelPlacement();
        } else {
          setSelectedFurniture(null);
          setSelectedWall(null);
        }
      } else if (e.key === "w" || e.key === "W" || e.key === "g" || e.key === "G") {
        if (selectedFurniture) setTransformMode("translate");
      } else if (e.key === "e" || e.key === "E" || e.key === "r" || e.key === "R") {
        if (selectedFurniture) setTransformMode("rotate");
      } else if (e.key === "s" || e.key === "S") {
        if (selectedFurniture) setTransformMode("scale");
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedFurniture) deleteFurniture();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [placementMode, selectedFurniture, cancelPlacement, deleteFurniture]);

  return (
    <div className="app">
      {/* Top Header */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">3D</div>
          <div>
            <div className="brand-title">House Viewer</div>
            <div className="brand-subtitle">
              360° Architectural Editor
            </div>
          </div>
        </div>

        <div className="topbar-right">
          <div className="status">
            <span className="status-dot" />
            <span>Ready</span>
          </div>
        </div>
      </header>

      {/* Main 3D Canvas Area */}
      <main className="viewer">
        <Scene
          furniture={furniture}
          selectedFurniture={selectedFurniture}
          setSelectedFurniture={setSelectedFurniture}
          transformMode={transformMode}
          placementMode={placementMode}
          previewPosition={previewPosition}
          setPreviewPosition={setPreviewPosition}
          onFloorHover={handleFloorHover}
          onRegisterCamera={handleRegisterCamera}
          cameraLocked={cameraLocked}
          setCameraLocked={setCameraLocked}
          wallColors={wallColors}
          selectedWall={selectedWall}
          setSelectedWall={setSelectedWall}
          onUpdateFurnitureTransform={updateFurnitureTransform}
        />

        {/* 360° Edit Mode Badge */}
        <div className="mode-badge">
          <span className="badge-dot" />
          <span>360° EDIT</span>
        </div>

        {/* Wall Customization Panel (shown when a wall is clicked) */}
        {selectedWall && (
          <div
            className="wall-panel"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
          >
            <div className="wall-panel-header">
              <div className="wall-title-area">
                <span className="wall-panel-label">Wall Customization</span>
                <span className="wall-panel-name">
                  {formatWallName(selectedWall)}
                </span>
              </div>
              <button
                className="close-btn"
                title="Deselect Wall"
                onClick={() => setSelectedWall(null)}
              >
                ✕
              </button>
            </div>

            <div className="palette-section-title">Color Palette</div>
            <div className="color-swatches-grid">
              {WALL_PALETTE.map((item) => (
                <button
                  key={item.color}
                  className={`color-swatch-btn ${
                    wallColors[selectedWall] === item.color ? "active" : ""
                  }`}
                  style={{ backgroundColor: item.color }}
                  title={item.name}
                  onClick={() => handleWallColorChange(item.color)}
                />
              ))}
            </div>

            <div className="custom-color-row">
              <div className="custom-color-label">
                <span>Custom:</span>
                <input
                  type="color"
                  className="color-picker-input"
                  value={wallColors[selectedWall] || "#ffffff"}
                  onChange={(e) => handleWallColorChange(e.target.value)}
                />
              </div>

              <button
                className="reset-wall-btn"
                onClick={handleResetWallColor}
              >
                Reset Default
              </button>
            </div>
          </div>
        )}

        {/* Placement Mode Banner */}
        {placementMode && (
          <div className="placement-banner">
            <span>📍 Move cursor/finger over floor to position ghost sofa</span>
          </div>
        )}

        {/* Floating Toolbar */}
        <div className="editor-toolbar">
          {!placementMode && (
            <>
              <button
                type="button"
                className="primary-add"
                onClick={startSofaPlacement}
              >
                + Sofa
              </button>

              {selectedFurniture && (
                <>
                  <div className="toolbar-divider" />

                  <span className="selected-item-tag">Sofa Selected</span>

                  <button
                    type="button"
                    className={transformMode === "translate" ? "active" : ""}
                    onClick={() => setTransformMode("translate")}
                    title="Translate (W)"
                  >
                    Move
                  </button>

                  <button
                    type="button"
                    className={transformMode === "rotate" ? "active" : ""}
                    onClick={() => setTransformMode("rotate")}
                    title="Rotate (E)"
                  >
                    Rotate
                  </button>

                  <button
                    type="button"
                    className={transformMode === "scale" ? "active" : ""}
                    onClick={() => setTransformMode("scale")}
                    title="Scale (S)"
                  >
                    Scale
                  </button>

                  <button
                    type="button"
                    className="danger"
                    onClick={deleteFurniture}
                    title="Delete (Del)"
                  >
                    Delete
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedFurniture(null)}
                    title="Deselect (Esc)"
                  >
                    ✕
                  </button>
                </>
              )}
            </>
          )}

          {placementMode && (
            <>
              <button
                type="button"
                className="add-btn-cta"
                onClick={(e) => {
                  e.stopPropagation();
                  addSofa();
                }}
              >
                ✓ ADD SOFA
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelPlacement();
                }}
              >
                ✕ Cancel
              </button>
            </>
          )}
        </div>

        {/* Navigation Help Bar */}
        <div className="navigation-help">
          <div className="nav-item">
            <span>Left Drag:</span> 360° Rotate
          </div>
          <div className="nav-item">
            <span>Scroll / Pinch:</span> Zoom
          </div>
          <div className="nav-item">
            <span>Right Drag:</span> Pan
          </div>
          <div className="nav-item">
            <span>Wall / Sofa:</span> Click to Edit
          </div>
        </div>
      </main>
    </div>
  );
}