/* "r3f-group" */
import { Group } from "three";

export const box = (relay) => {
  let group = new Group();

  relay.box.inputs.map((e, idx) => {
    return relay.stream(idx, ({ type, item }) => {
      if (type === "add") {
        group.add(item);
      }
      if (type === "remove") {
        group.remove(item);
      }
    });
  });

  relay.pulse({
    type: "mount",
    Component: () => {
      return <primitive object={group}></primitive>;
    },
  });
};
