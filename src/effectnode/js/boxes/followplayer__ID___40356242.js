/* "GroovyLight" */

import { useRef, useState, useEffect } from "react";
import { useFrame } from "react-three-fiber";

const FollowPlayer = ({ children }) => {
  const group = useRef();

  useFrame(({ camera }) => {
    if (group.current) {
      group.current.position.x = camera.position.x;
      group.current.position.z = camera.position.z;
    }
  });

  return <group ref={group}>{children}</group>;
};

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

export const box = (relay) => {
  relay.pulse({
    type: "mount",
    Component: () => {
      return (
        <FollowPlayer>
          <InputReceivers relay={relay}></InputReceivers>
        </FollowPlayer>
      );
    },
  });
};
