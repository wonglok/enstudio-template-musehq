/* "noodle-geometry" */

import {
  BufferAttribute,
  CylinderBufferGeometry,
  IcosahedronBufferGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Vector2,
} from "three";
import { Geometry } from "three/examples/jsm/deprecated/Geometry";

export class NoodleGeometry {
  constructor({
    count = 100,
    numSides = 8,
    subdivisions = 50,
    openEnded = true,
    ballSize = 1.0,
  }) {
    //
    const radius = 1;
    const length = 1;

    const cylinderBufferGeo = new CylinderBufferGeometry(
      radius,
      radius,
      length,
      numSides,
      subdivisions,
      openEnded
    );

    let baseGeometry = new Geometry();
    baseGeometry = baseGeometry.fromBufferGeometry(cylinderBufferGeo);

    baseGeometry.rotateZ(Math.PI / 2);

    // compute the radial angle for each position for later extrusion
    const tmpVec = new Vector2();
    const xPositions = [];
    const angles = [];
    const uvs = [];
    const vertices = baseGeometry.vertices;
    const faceVertexUvs = baseGeometry.faceVertexUvs[0];
    const oPositions = [];

    // Now go through each face and un-index the geometry.
    baseGeometry.faces.forEach((face, i) => {
      const { a, b, c } = face;
      const v0 = vertices[a];
      const v1 = vertices[b];
      const v2 = vertices[c];
      const verts = [v0, v1, v2];
      const faceUvs = faceVertexUvs[i];

      // For each vertex in this face...
      verts.forEach((v, j) => {
        tmpVec.set(v.y, v.z).normalize();

        // the radial angle around the tube
        const angle = Math.atan2(tmpVec.y, tmpVec.x);
        angles.push(angle);

        // "arc length" in range [-0.5 .. 0.5]
        xPositions.push(v.x);
        oPositions.push(v.x, v.y, v.z);

        // copy over the UV for this vertex
        uvs.push(faceUvs[j].toArray());
      });
    });

    // build typed arrays for our attributes
    const posArray = new Float32Array(xPositions);
    const angleArray = new Float32Array(angles);
    const uvArray = new Float32Array(uvs.length * 2);

    const origPosArray = new Float32Array(oPositions);

    // unroll UVs
    for (let i = 0; i < posArray.length; i++) {
      const [u, v] = uvs[i];
      uvArray[i * 2 + 0] = u;
      uvArray[i * 2 + 1] = v;
    }

    const lineGeometry = new InstancedBufferGeometry();
    lineGeometry.instanceCount = count;

    lineGeometry.setAttribute("position", new BufferAttribute(origPosArray, 3));
    lineGeometry.setAttribute("newPosition", new BufferAttribute(posArray, 1));
    lineGeometry.setAttribute("angle", new BufferAttribute(angleArray, 1));
    lineGeometry.setAttribute("uv", new BufferAttribute(uvArray, 2));

    let offsets = [];
    let ddxyz = Math.floor(Math.pow(count, 1 / 3));
    for (let z = 0; z < ddxyz; z++) {
      for (let y = 0; y < ddxyz; y++) {
        for (let x = 0; x < ddxyz; x++) {
          offsets.push(
            (x / ddxyz) * 2.0 - 1.0,
            (y / ddxyz) * 2.0 - 1.0,
            (z / ddxyz) * 2.0 - 1.0
          );
        }
      }
    }

    lineGeometry.setAttribute(
      "offset",
      new InstancedBufferAttribute(new Float32Array(offsets), 3)
    );

    let isoGeo = new IcosahedronBufferGeometry(0.005 * ballSize, 1);

    let ballGeometry = new InstancedBufferGeometry();
    ballGeometry = ballGeometry.copy(isoGeo);
    ballGeometry.instanceCount = count;

    ballGeometry.setAttribute(
      "offset",
      new InstancedBufferAttribute(new Float32Array(offsets), 3)
    );

    return {
      lineGeometry,
      ballGeometry,
    };
  }
}

export const box = async (relay) => {
  let { spec } = await relay.waitFor(0);
  let noodleGeo = new NoodleGeometry({ ...spec });
  relay.pulse(noodleGeo);
};
