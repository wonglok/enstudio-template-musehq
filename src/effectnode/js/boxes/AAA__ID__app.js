/*
BoxScripts[box.moduleName].box({
  resources,
  domElement: mounter,
  pulse,
  inputAt,
  log: (v) => {
    console.log(JSON.stringify(v, null, 4));
  },
  graph: lowdb,
});
*/

import ReactDOM from "react-dom";
import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Switch, Route } from "react-router-dom";

function EachInput({ relay, idx }) {
  const [compo, setCompo] = useState(null);

  useEffect(() => {
    return relay.stream(idx, ({ type, Component, href }) => {
      if (type === "page-route") {
        setCompo(
          <Route to={href}>
            <Component></Component>
          </Route>
        );
      }
    });
  });

  return compo;
}

function InputsAsRoutes({ relay }) {
  let rotues = relay.box.inputs.map((e) => {
    return <EachInput key={e._id} relay={relay}></EachInput>;
  });

  return (
    <Router>
      <Switch>{rotues}</Switch>
    </Router>
  );
}

export const box = ({ domElement, ...relay }) => {
  ReactDOM.render(<InputsAsRoutes relay={relay}></InputsAsRoutes>, domElement);
};
