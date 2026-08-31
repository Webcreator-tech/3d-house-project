import React, {
  Suspense,
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
   HOUSE
========================================================= */

function HouseModel() {
  const { scene } = useGLTF("/models/house.glb");

  const model = useMemo(() => {
    const cloned = scene.clone(true);

    const box = new THREE.Box3().setFromObject(cloned);
    const center = box.getCenter(new THREE.Vector3());

    cloned.position.set(
      -center.x,
      -box.min.y,
      -center.z
    );

    cloned.traverse((child) => {
      if (!child.isMesh) return;

      child.castShadow = true;
      child.receiveShadow = true;

      child.userData.housePart = true;

      const name =
        child.name?.toLowerCase() || "";

      if (
        name.includes("wrap_") ||
        name.includes("div_")
      ) {
        child.userData.editableWall = true;
      }
    });

    return cloned;
  }, [scene]);

  return <primitive object={model} />;
}

useGLTF.preload("/models/house.glb");


/* =========================================================
   TEMPORARY SOFA
========================================================= */

function SofaModel({ ghost = false }) {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#6b7280",
        transparent: ghost,
        opacity: ghost ? 0.32 : 1,
        roughness: 0.8,
      }),
    [ghost]
  );

  const darkMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#374151",
        transparent: ghost,
        opacity: ghost ? 0.28 : 1,
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
        castShadow
      >
        <boxGeometry args={[3.2, 0.7, 1.35]} />
      </mesh>

      {/* Back */}
      <mesh
        position={[0, 1.45, -0.52]}
        material={material}
        castShadow
      >
        <boxGeometry args={[3.2, 1.35, 0.35]} />
      </mesh>

      {/* Left arm */}
      <mesh
        position={[-1.48, 1.0, 0]}
        material={material}
        castShadow
      >
        <boxGeometry args={[0.3, 0.85, 1.4]} />
      </mesh>

      {/* Right arm */}
      <mesh
        position={[1.48, 1.0, 0]}
        material={material}
        castShadow
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
          castShadow
        >
          <boxGeometry args={[0.16, 0.5, 0.16]} />
        </mesh>
      ))}

    </group>
  );
}


/* =========================================================
   INVISIBLE PLACEMENT FLOOR
========================================================= */

function PlacementSurface({ active, onMove }) {
  const { camera, gl } = useThree();

  const raycaster = useMemo(
    () => new THREE.Raycaster(),
    []
  );

  const pointer = useMemo(
    () => new THREE.Vector2(),
    []
  );

  const plane = useMemo(
    () =>
      new THREE.Plane(
        new THREE.Vector3(0, 1, 0),
        0
      ),
    []
  );

  const hitPoint = useMemo(
    () => new THREE.Vector3(),
    []
  );

  useEffect(() => {
    if (!active) return;

    const canvas = gl.domElement;

    const handlePointerMove = (event) => {
      const rect =
        canvas.getBoundingClientRect();

      pointer.x =
        ((event.clientX - rect.left) /
          rect.width) *
          2 -
        1;

      pointer.y =
        -(
          (event.clientY - rect.top) /
            rect.height
        ) *
          2 +
        1;

      raycaster.setFromCamera(
        pointer,
        camera
      );

      /*
       * Intersect directly with our
       * mathematical floor plane.
       *
       * This means walls, sofa and
       * house meshes cannot interfere.
       */
      const hit =
        raycaster.ray.intersectPlane(
          plane,
          hitPoint
        );

      if (!hit) return;

      /*
       * House is 32 × 36 ft.
       *
       * Blender GLB dimensions are
       * approximately 9.7536 × 10.9728 m.
       *
       * We use the model's centered
       * coordinate system.
       */

      const HALF_WIDTH = 4.8768;
      const HALF_LENGTH = 5.4864;

      const x = THREE.MathUtils.clamp(
        hitPoint.x,
        -HALF_WIDTH,
        HALF_WIDTH
      );

      const z = THREE.MathUtils.clamp(
        hitPoint.z,
        -HALF_LENGTH,
        HALF_LENGTH
      );

      onMove([x, 0, z]);
    };

    canvas.addEventListener(
      "pointermove",
      handlePointerMove
    );

    return () => {
      canvas.removeEventListener(
        "pointermove",
        handlePointerMove
      );
    };
  }, [
    active,
    camera,
    gl,
    onMove,
    plane,
    pointer,
    raycaster,
    hitPoint,
  ]);

  return null;
}


/* =========================================================
   FURNITURE ITEM
========================================================= */

function FurnitureItem({
  item,
  selected,
  transformMode,
  onSelect,
  onTransformStart,
  onTransformEnd,
}) {
  const groupRef = useRef(null);

  return (
    <>
      {selected && (
        <TransformControls
          object={groupRef.current}
          mode={transformMode}
          size={0.75}

          onMouseDown={() => {
            onTransformStart();
          }}

          onMouseUp={() => {
            onTransformEnd();
          }}
        />
      )}

      <group
        ref={groupRef}
        position={item.position}
        rotation={item.rotation}
        scale={item.scale}

        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(item.id);
        }}
      >

        {item.type === "sofa" && (
          <SofaModel />
        )}

      </group>
    </>
  );
}


/* =========================================================
   PLACEMENT PREVIEW
========================================================= */

function PlacementPreview({
  active,
  position,
}) {
  if (!active) return null;

  return (
    <group position={position}>

      {/* Ghost sofa */}
      <SofaModel ghost />

      {/* Ground ring */}
      <mesh
        position={[0, 0.025, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry
          args={[1.75, 1.95, 48]}
        />

        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.8}
        />
      </mesh>

    </group>
  );
}


/* =========================================================
   LOADING
========================================================= */

function LoadingScreen() {
  return (
    <Html center>
      <div className="loading-box">
        Loading house...
      </div>
    </Html>
  );
}


/* =========================================================
   SCENE
========================================================= */

function Scene({
  furniture,
  selectedFurniture,
  setSelectedFurniture,

  transformMode,

  placementMode,

  previewPosition,
  setPreviewPosition,

  cameraLocked,
  setCameraLocked,
}) {
  return (
    <Canvas
      shadows

      camera={{
        position: [18, 14, 18],
        fov: 45,
        near: 0.01,
        far: 1000,
      }}

      gl={{
        antialias: true,
        logarithmicDepthBuffer: true,
      }}

      onPointerMissed={() => {
        if (!placementMode) {
          setSelectedFurniture(null);
        }
      }}
    >

      <color
        attach="background"
        args={["#101318"]}
      />

      <ambientLight intensity={1.6} />

      <directionalLight
        position={[10, 15, 20]}
        intensity={3}
        castShadow
      />

      <directionalLight
        position={[-10, 10, -10]}
        intensity={1.4}
      />

      <Suspense fallback={<LoadingScreen />}>

        <HouseModel />

        {furniture.map((item) => (
          <FurnitureItem
            key={item.id}
            item={item}

            selected={
              selectedFurniture === item.id
            }

            transformMode={
              transformMode
            }

            onSelect={(id) => {
              if (placementMode) return;

              setSelectedFurniture(id);
            }}

            onTransformStart={() => {
              setCameraLocked(true);
            }}

            onTransformEnd={() => {
              setCameraLocked(false);
            }}
          />
        ))}

        {/* Ghost */}
        <PlacementPreview
          active={placementMode}
          position={previewPosition}
        />

        {/* Invisible mathematical floor */}
        <PlacementSurface
          active={placementMode}
          onMove={setPreviewPosition}
        />

        <Environment preset="city" />

      </Suspense>


      {/* =================================================
          360° CAMERA
      ================================================= */}

      <OrbitControls
        enabled={
          !cameraLocked &&
          !placementMode
        }

        enableDamping
        dampingFactor={0.08}

        rotateSpeed={0.6}
        zoomSpeed={0.8}
        panSpeed={0.8}

        enableRotate
        enableZoom
        enablePan

        minDistance={1}
        maxDistance={100}

        minPolarAngle={0.05}
        maxPolarAngle={
          Math.PI - 0.05
        }

        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
      />

    </Canvas>
  );
}


/* =========================================================
   APP
========================================================= */

export default function App() {

  const [
    placementMode,
    setPlacementMode,
  ] = useState(false);

  const [
    previewPosition,
    setPreviewPosition,
  ] = useState([0, 0, 0]);

  const [
    furniture,
    setFurniture,
  ] = useState([]);

  const [
    selectedFurniture,
    setSelectedFurniture,
  ] = useState(null);

  const [
    transformMode,
    setTransformMode,
  ] = useState("translate");

  const [
    cameraLocked,
    setCameraLocked,
  ] = useState(false);


  /* =====================================================
     START PLACEMENT
  ===================================================== */

  const startSofaPlacement = () => {

    setSelectedFurniture(null);

    setPreviewPosition([
      0,
      0,
      0,
    ]);

    setPlacementMode(true);
  };


  /* =====================================================
     ADD SOFA
  ===================================================== */

  const addSofa = () => {

    const newSofa = {

      id:
        `sofa-${Date.now()}`,

      type:
        "sofa",

      position:
        [...previewPosition],

      rotation:
        [0, 0, 0],

      scale:
        [1, 1, 1],
    };


    setFurniture(
      (previous) => [
        ...previous,
        newSofa,
      ]
    );

    setPlacementMode(false);

    setSelectedFurniture(
      newSofa.id
    );

    setTransformMode(
      "translate"
    );
  };


  /* =====================================================
     CANCEL
  ===================================================== */

  const cancelPlacement = () => {

    setPlacementMode(false);

    setPreviewPosition([
      0,
      0,
      0,
    ]);
  };


  /* =====================================================
     DELETE
  ===================================================== */

  const deleteFurniture = () => {

    if (!selectedFurniture) {
      return;
    }

    setFurniture(
      (previous) =>
        previous.filter(
          (item) =>
            item.id !==
            selectedFurniture
        )
    );

    setSelectedFurniture(null);
  };


  return (
    <div className="app">

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="topbar">

        <div className="brand">

          <div className="brand-icon">
            3D
          </div>

          <div>

            <div className="brand-title">
              House Viewer
            </div>

            <div className="brand-subtitle">
              360° Architectural Editor
            </div>

          </div>

        </div>


        <div className="status">

          <span className="status-dot" />

          Model Loaded

        </div>

      </header>


      {/* =================================================
          VIEWER
      ================================================= */}

      <main className="viewer">

        <Scene

          furniture={
            furniture
          }

          selectedFurniture={
            selectedFurniture
          }

          setSelectedFurniture={
            setSelectedFurniture
          }

          transformMode={
            transformMode
          }

          placementMode={
            placementMode
          }

          previewPosition={
            previewPosition
          }

          setPreviewPosition={
            setPreviewPosition
          }

          cameraLocked={
            cameraLocked
          }

          setCameraLocked={
            setCameraLocked
          }

        />


        <div className="mode-badge">
          360° EDIT
        </div>


        {/* =================================================
            TOOLBAR
        ================================================= */}

        <div className="editor-toolbar">

          {!placementMode && (
            <>

              <button
                onClick={
                  startSofaPlacement
                }
              >
                + Sofa
              </button>


              {selectedFurniture && (
                <>

                  <button
                    className={
                      transformMode ===
                      "translate"
                        ? "active"
                        : ""
                    }

                    onClick={() =>
                      setTransformMode(
                        "translate"
                      )
                    }
                  >
                    Move
                  </button>


                  <button
                    className={
                      transformMode ===
                      "rotate"
                        ? "active"
                        : ""
                    }

                    onClick={() =>
                      setTransformMode(
                        "rotate"
                      )
                    }
                  >
                    Rotate
                  </button>


                  <button
                    className={
                      transformMode ===
                      "scale"
                        ? "active"
                        : ""
                    }

                    onClick={() =>
                      setTransformMode(
                        "scale"
                      )
                    }
                  >
                    Scale
                  </button>


                  <button
                    className="danger"
                    onClick={
                      deleteFurniture
                    }
                  >
                    Delete
                  </button>

                </>
              )}

            </>
          )}


          {placementMode && (
            <>

              <div className="placement-text">
                Move the ghost sofa to choose
                its position
              </div>


              <button
                className="active add-button"
                onClick={addSofa}
              >
                ADD SOFA
              </button>


              <button
                onClick={
                  cancelPlacement
                }
              >
                Cancel
              </button>

            </>
          )}

        </div>


        {/* =================================================
            HELP
        ================================================= */}

        <div className="navigation-help">

          <span>Drag</span>
          Rotate

          <span>Scroll / Pinch</span>
          Zoom

          <span>
            Right drag / Two fingers
          </span>
          Pan

        </div>

      </main>

    </div>
  );
}