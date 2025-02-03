import { connectElements } from '../utils/layoutUtil.js';
import { is } from '../di/DiUtil.js';
import {
  findElementInTree,
  getAdjacentElements, getAttachedOutgoingElements,
  getIncomingElements,
  getOutgoingElements
} from '../utils/elementUtils.js';

export default {
  'addToGrid': ({ element, grid, stack }) => {
    let nextElements = [];

    // Handle outgoing paths without boundaryEvents
    // Maybe later it will merge
    const outgoing = !grid.isFlipped ? new Set(getOutgoingElements(element).concat(getAttachedOutgoingElements(element))) : new Set(getIncomingElements(element)) ;

    let previousElement = null;

    // Непонятно зачем но пусть будет пока
    if (outgoing.size > 1 && isNextElementTasks(outgoing)) {
      grid.adjustGridPosition(element);
    }

    outgoing.forEach(nextElement => {


      if (grid.hasElement(nextElement)) {

        previousElement = nextElement;
        return;
      }

      // Prevent revisiting future incoming elements and ensure proper traversal without early exit
      // The graph breaks here in isFutureIncoming if there are starting throwEvents hanging in the air
      // need refactoring
      const prevAndStack = previousElement || stack.length > 0
      const futureIncoming = isFutureIncoming(nextElement, grid.elements, grid.isFlipped)
      const notCheckForLoop = !checkForLoop(nextElement, grid.elements, grid.isFlipped)

      if (prevAndStack && futureIncoming && notCheckForLoop) {
        return;
      }

      if (!previousElement) {
        // здесь проверка на boundary
        if (isFromHost (element, nextElement, grid.isFlipped)){
          addAfter(element, nextElement, grid);
        } else {
          addDiagonal(element, nextElement, grid)
        }

      } else {

        // Здесь
        const [ , prevCol ] = grid.find(previousElement);
        const [ , elCol ] = grid.find(element);
        if (prevCol <= elCol) {
          if (isFromHost (element, nextElement, grid.isFlipped)){
            addAfter(element, nextElement, grid);
          } else {
            addDiagonal(element, nextElement, grid)
          }
        }
        else {
          addBelow(element, previousElement, nextElement, grid);
        }
      }

      // Avoid self-loops
      if (nextElement !== element) {
        previousElement = nextElement;
      }

      nextElements.unshift(nextElement);
    });

    // Sort elements by priority to ensure proper stack placement
    nextElements = sortByType(nextElements, 'bpmn:ExclusiveGateway'); // TODO: sort by priority
    return nextElements;
  },

  'createConnectionDi': ({ element, row, col, layoutGrid, diFactory }) => {
    const outgoing = element.outgoing || [];

    return outgoing.map(out => {
      const target = out.targetRef;
      const waypoints = connectElements(element, target, layoutGrid);

      return diFactory.createDiEdge(out, waypoints, {
        id: out.id + '_di'
      });
    });
  }
};


// helpers /////

function sortByType(arr, type) {
  const nonMatching = arr.filter(item => !is(item, type));
  const matching = arr.filter(item => is(item, type));

  return [ ...matching, ...nonMatching ];
}

function checkForLoop(element, visited, reverse) {

  const elementIncomingList = !reverse ? new Set(getIncomingElements(element)) : new Set(getOutgoingElements(element).concat(getAttachedOutgoingElements(element)));

  for (const incomingElement of elementIncomingList) {
    if (!visited.has(incomingElement)) {
      return findElementInTree(element, incomingElement, reverse);
    }
  }
}

function isFutureIncoming(element, visited, reverse) {
  const elementIncomingList = !reverse ? new Set(getIncomingElements(element)) : new Set(getOutgoingElements(element).concat(getAttachedOutgoingElements(element)));

  if (elementIncomingList.size > 1) {
    for (const incomingElement of elementIncomingList) {
      if (!visited.has(incomingElement)) {
        return true;
      }
    }
  }
  return false;
}

function isNextElementTasks(elements) {
  return [...elements].every(element => is(element, 'bpmn:Task'));
}

export function addAfter(element, nextElement, grid) {
  const [ elementRow, elementCol ] = grid.find(element) || [];

  const occupiedElement = grid.get(elementRow, elementCol + 1);

  if (occupiedElement) {
    grid.expandXAxisWith([ elementRow, elementCol ]);
  }
  // Todo: add try catch
  grid.add(nextElement, [ elementRow, elementCol + 1 ]);

}

export function addBelow(element, previousElement, nextElement, grid) {
  const [ previousElementRow, previousElementCol ] = grid.find(previousElement) || [];
  const occupiedElement = grid.get(previousElementRow + 1, previousElementCol);
  if (occupiedElement || grid.rowCount === previousElementRow + 1) {
    grid.createRow(previousElementRow);
  }
  // Todo: add try catch
  grid.add(nextElement, [previousElementRow + 1, previousElementCol]);

}

function isFromHost (hostElement, targetElement, reverse) {
  const incoming = !reverse ? targetElement.incoming : targetElement.outgoing;
  const fromHost = incoming.map(element => !reverse ? element.sourceRef : element.targetRef).filter(item => !item.attachedToRef)
  return fromHost.includes(hostElement)
}

function addDiagonal(element, nextElement, grid) {
  const [ elementRow, elementCol ] = grid.find(element) || [];

  const occupiedElement = grid.get(elementRow + 1, elementCol + 1);

  if (occupiedElement) {
    grid.expandXAxisWith([ elementRow, elementCol ]);
  }
  // Todo: add try catch
  grid.add(nextElement, [ elementRow + 1, elementCol + 1 ]);
}