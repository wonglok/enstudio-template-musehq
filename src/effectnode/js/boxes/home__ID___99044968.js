import { OrbitControls } from "@react-three/drei";
import React, { useEffect, useState } from "react";
import { Canvas, useThree } from "react-three-fiber";
import { Color, sRGBEncoding } from "three";

function EachInput({ relay, idx }) {
  const [compo, setCompo] = useState(<group></group>);
  useEffect(() => {
    return relay.stream(idx, ({ type, Component }) => {
      if (type === "mount") {
        setCompo(
          <Component
            key={`_` + Math.floor(Math.random() * 10000000)}
          ></Component>
        );
      }
    });
  });
  return compo;
}

function InputObject3D({ relay }) {
  let items = relay.box.inputs.map((e, idx) => {
    return <EachInput key={e._id} idx={idx} relay={relay}></EachInput>;
  });
  return <group>{items}</group>;
}

function BgEnv() {
  let { scene } = useThree();
  scene.background = new Color("#232323");

  return <group></group>;
}

export const box = (relay) => {
  relay.pulse({
    type: "page-route",
    href: "/",
    Component: () => {
      return (
        <Canvas
          colorManagement={true}
          pixelRatio={window.devicePixelRatio || 1.0}
          camera={{ position: [0, 0, -150] }}
          onCreated={({ gl }) => {
            gl.outputEncoding = sRGBEncoding;
          }}
        >
          <BgEnv></BgEnv>
          <InputObject3D relay={relay}></InputObject3D>
          <OrbitControls />
          <ambientLight intensity={1.0} />
        </Canvas>
      );
    },
  });
};
