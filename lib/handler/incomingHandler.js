import { is } from '../di/DiUtil.js';
import { getIncomingElements, getOutgoingElements } from '../utils/elementUtils.js';
import { addAfter } from './outgoingHandler.js';

export default {
  'addToGrid': ({ element, grid }) => {

    //todo: add case with boundary incoming

    // never used
    const nextElements = [];

    const incoming = !grid.isFlipped ? getIncomingElements(element) : getOutgoingElements(element);

    const elementInGrid = grid.hasElement(element);
    const incomingInGrid = incoming.filter(el => grid.hasElement(el));

    if (!elementInGrid && incomingInGrid.length === 1) {
      addAfter(incoming[0], element, grid);
    } else if (!elementInGrid && incomingInGrid.length > 1) {

      // get the right bottom one... while there are no other ideas, we need to try
      const sourceElement = incoming.reduce((acc, cur) => {
        const [ accRow, accCol ] = acc;
        const [ curRow, curCol ] = cur;
        if (curRow >= accRow && accCol <= curCol) return cur;
        return acc;
      }, incoming[0]);

      // For now, we just insert without checking intersections - I don't think this is a common case
      addAfter(sourceElement, element, grid);
    } else if (!elementInGrid && incomingInGrid.length === 0) {
      grid.add(element);
    }
    return nextElements;
  },
};

function isNextElementExclusiveGateway(elements) {
  return elements.every(element => is(element, 'bpmn:ExclusiveGateway'));
}
