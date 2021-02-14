/* "spec" */

export const box = (relay) => {
  let spec = {
    count: 1000,
    numSides: 8,
    subdivisions: 50,
    openEnded: true,
    ballSize: 1.0,
    thickness: 0.67,
  };

  relay.pulse({ spec });
};
