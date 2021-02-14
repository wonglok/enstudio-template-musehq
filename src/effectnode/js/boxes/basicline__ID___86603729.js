import { Mesh } from "three";

/* "basic-line" */
export const box = async (relay) => {
  let { lineGeometry } = await relay.waitFor(0);
  let { lineMaterial } = await relay.waitFor(1);

  const mesh = new Mesh(lineGeometry, lineMaterial);
  mesh.frustumCulled = false;
  mesh.scale.set(100, 100, 100);

  relay.pulse({
    type: "add",
    item: mesh,
  });
};
