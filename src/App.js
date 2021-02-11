import { useEffect, useRef } from "react";
import EffectNode from "./effectnode/js/core";
function App() {
  let div = useRef();

  useEffect(() => {
    EffectNode({ mounter: div.current });
  }, [div.current]);

  return <div ref={div} className="full"></div>;
}

export default App;
