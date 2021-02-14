import React, { useEffect, useState } from "react";
import { StandardEnvironment, Background, Fog } from "spacesvr";
import { Color } from "three";

function EachInput({ relay, idx }) {
  const [compo, setCompo] = useState(<group></group>);
  useEffect(() => {
    return relay.stream(idx, ({ type, Component }) => {
      if (type === "add") {
        setCompo(<Component key={`_` + Math.random() * 10000000}></Component>);
      }
    });
  });
  return compo;
}

function InputReceivers({ relay }) {
  let rotues = relay.box.inputs.map((e, idx) => {
    return <EachInput key={e._id} idx={idx} relay={relay}></EachInput>;
  });
  return <group>{rotues}</group>;
}

function EnvColor({ relay }) {
  const [fogColor, setFogColor] = useState("white");
  const [bgColor, setBGColor] = useState("white");
  const [ambinet, setAmbineColor] = useState("white");

  useEffect(() => {
    return relay.onUserData(({ fog, bg, amb }) => {
      setFogColor(fog);
      setBGColor(bg);
      setAmbineColor(amb);
    });
  }, []);

  return (
    <>
      <ambientLight color={ambinet} />
      <Background color={bgColor} />
      <Fog color={new Color(fogColor)} near={0} far={20} />
    </>
  );
}

export const box = (relay) => {
  relay.pulse({
    type: "page-route",
    href: "/",
    Component: () => {
      return (
        <div className="h-full w-full">
          <StandardEnvironment>
            {/* <Background color={bgColor} />
            <Fog color={new Color(fogColor)} near={0} far={20} /> */}

            <EnvColor relay={relay}></EnvColor>

            <InputReceivers relay={relay}></InputReceivers>

            <mesh rotation-x={-Math.PI / 2}>
              <planeBufferGeometry args={[200, 200]} />
              <meshStandardMaterial color="#ffa7a7" />
            </mesh>
          </StandardEnvironment>
        </div>
      );
    },
  });
};
