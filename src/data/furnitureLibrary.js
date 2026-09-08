export const FURNITURE_LIBRARY = [
  {
    id: "sofa",
    name: "Sofa",
    modelPath: "/models/furniture/sofa_02.glb",
    defaultScale: [1, 1, 1],
  },

  {
    id: "tv",
    name: "TV",
    modelPath: "/models/furniture/wall_flat_tv.glb",
    defaultScale: [0.0015, 0.0015, 0.0015],
  },
];

export function getFurnitureDefinition(id) {
  return (
    FURNITURE_LIBRARY.find(
      (item) => item.id === id
    ) || null
  );
}
