/* "ball" */
import { Mesh } from "three";

export const box = async (relay) => {
  let { ballGeometry } = await relay.waitFor(0);
  let { ballMaterial } = await relay.waitFor(1);

  const mesh = new Mesh(ballGeometry, ballMaterial);
  mesh.frustumCulled = false;
  mesh.scale.set(100, 100, 100);

  relay.pulse({
    type: "add",
    item: mesh,
  });
};
