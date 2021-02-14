import { useRef } from "react";
import { useFrame } from "react-three-fiber";
import { useEnvironment } from "spacesvr";
import * as THREE from "three";
import { useSpring, config } from "react-spring";

const GroovyLight = () => {
  const spotLight = useRef(new THREE.SpotLight());
  // const col = useRef(new THREE.Color());
  const { player } = useEnvironment();

  const [spring, setSpring] = useSpring(() => ({
    v: [0],
    config: config.slow,
  }));

  useFrame(({ clock }) => {
    if (spotLight.current && player?.velocity) {
      const vel = player.velocity.get();
      setSpring({ v: [vel.length()] });

      const v = spring.v.payload[0].value;

      spotLight.current.intensity = v;

      const h = (clock.getElapsedTime() / 2) % 1;
      const s = Math.min(Math.max(0, v), 1);
      const l = 0.8;
      spotLight.current.color.setHSL(h, s, l);
    }
  });

  return (
    <group position-y={10}>
      <primitive
        object={spotLight.current}
        intensity={1.5}
        angle={0.4}
        penumbra={0.6}
        color="white"
      />

      <primitive object={spotLight.current.target} position={[0, -1, 0]} />
    </group>
  );
};

export const box = (relay) => {
  relay.pulse({
    type: "mount",
    Component: () => {
      return <GroovyLight></GroovyLight>;
    },
  });
};
