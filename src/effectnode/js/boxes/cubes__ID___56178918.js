import { useEffect, useState } from "react";
import { Color } from "three";
import { Floating } from "spacesvr";

const COUNT = 150;
const RANGE_XZ = 50;
const RANGE_Y = 30;

// type Cube = {
//   position: [number, number, number],
//   size: number,
//   color: Color,
//   speed: number,
// };

const Cubes = ({ relay }) => {
  const [cubes, setCubes] = useState(() => {
    const arr = [];
    for (let i = 0; i < COUNT; i++) {
      arr.push({
        position: [
          Math.random() * RANGE_XZ * 2 - RANGE_XZ,
          Math.random() * RANGE_Y,
          Math.random() * RANGE_XZ * 2 - RANGE_XZ,
        ],
        size: 0.5 + Math.random() * 2.5,
        orig: new Color().setHSL(Math.random(), Math.random(), Math.random()),
        color: new Color().setHSL(Math.random(), Math.random(), Math.random()),
        speed: Math.random() + 0.4,
      });
    }
    return arr;
  }, []);

  useEffect(() => {
    return relay.onUserData(({ tintColor }) => {
      let tint = new Color(tintColor);
      setCubes((cubes) => {
        let copy = [...cubes];
        copy.forEach((cube) => {
          cube.color = cube.color.clone().set(cube.orig).multiply(tint);
        });
        return copy;
      });
    });
  }, []);

  return (
    <group>
      {cubes.map((cube, _idx) => (
        <Floating
          key={"cube" + _idx}
          height={cube.size * 1.5}
          speed={cube.speed}
        >
          <mesh position={cube.position}>
            <boxBufferGeometry args={[cube.size, cube.size * 20, cube.size]} />
            <meshStandardMaterial color={cube.color} />
          </mesh>
        </Floating>
      ))}
    </group>
  );
};

// export default Cubes;

// /* "Cubes" */

export const box = (relay) => {
  relay.pulse({
    type: "add",
    Component: () => {
      return <Cubes relay={relay}></Cubes>;
    },
  });
};
