import BPMNModdle from 'bpmn-moddle';
import {
  getAttachedOutgoingElements,
  getIncomingElements as utilsGetIncomingElements,
  getOutgoingElements as utilsGetOutgoingElements,
  isBoundaryEvent,
  isConnection,
  isStartIntermediate,
  getHostIncoming,
  getBoundaryIncomingHosts
} from './utils/elementUtils.js';
import { Grid } from './Grid.js';
import { DiFactory } from './di/DiFactory.js';
import { is } from './di/DiUtil.js';
import { handlers } from './handler/index.js';
import { isFunction } from 'min-dash';
import * as grid from "min-dash";
import {createTestGrid} from './createTestGrid.js'

export class Layouter {
  constructor() {
    this.moddle = new BPMNModdle();
    this.diFactory = new DiFactory(this.moddle);
    this._handlers = handlers;
  }

  handle(operation, options) {
    return this._handlers
      .filter(handler => isFunction(handler[operation]))
      .map(handler => handler[operation](options));
  }

  async layoutProcess(xml) {
    const { rootElement } = await this.moddle.fromXML(xml);

    this.diagram = rootElement;

    const root = this.getProcess();

    if (root) {
      this.cleanDi();
      this.handlePlane(root);
    }

    return (await this.moddle.toXML(this.diagram, { format: true })).xml;
  }

  handlePlane(planeElement) {
    let layout = this.createGridLayout(planeElement);
    // layout = createTestGrid(layout)
    this.generateDi(planeElement, layout);
  }

  cleanDi() {
    this.diagram.diagrams = [];
  }

  createGridLayout(root) {
    const grid = new Grid();

    const flowElements = root.flowElements || [];
    const elements = flowElements.filter(el => !is(el,'bpmn:SequenceFlow'));

    // check for empty process/subprocess
    if (!flowElements) {
      return grid;
    }

    const boundaryEvents = flowElements.filter(el => isBoundaryEvent(el));
    boundaryEvents.forEach(boundaryEvent => {
      const attachedTask = boundaryEvent.attachedToRef;
      const attachers = attachedTask.attachers || [];
      attachers.push(boundaryEvent);
      attachedTask.attachers = attachers;
    });

    // Depth-first-search with reverse

    const elementsWithoutBoundary = elements.filter(el => !isBoundaryEvent(el));

    while (grid.elements.size < elementsWithoutBoundary.length) {

      // maybe need boundaryEvents processing here
      const startingElementsOnly = flowElements.filter(el => {

        // work with elements are not in the grid
        if (!grid.hasElement(el)) {
          return !isConnection(el) && !isBoundaryEvent(el) && (!el.incoming || el.length === 0) && !isStartIntermediate(el);
        }
      });

      const outgoingElementsInGrid = elementsWithoutBoundary.filter(el => {
        if (!isBoundaryEvent(el)) {

          // work with elements are in the grid
          if (grid.hasElement(el)) {

            // get outgoing
            // if at least one element is not in visited, then return the element
            const elOutgoingSet = getOutgoingElements(el, grid.isFlipped)
            const elOutgoing = [...elOutgoingSet].filter(elOut => {

              // should not be in grid
              return (!grid.hasElement(elOut));

            });
            return elOutgoing > 0;
          }
        }
      });

      // get elements in the grid that have incoming that are not in grid
      const flippedOutgoingStart = [...grid.elements].filter(el => {
        const incoming = getIncomingElements(el, grid.isFlipped);

        for (const incomingElement of incoming) {
          if (!grid.elements.has(incomingElement)) return true;
        }
      });

      // untraversed elements exiting the grid
      const outgoingFromGrid = elementsWithoutBoundary.filter(el => {

        if (!grid.hasElement(el)) {
          const incoming = getIncomingElements(el, grid.isFlipped);
          for (const incomingElement of incoming) {
            if (grid.hasElement(incomingElement)) {
              return true;
            }
          }
        }

      });

      // All elements without incoming from other elements
      // this case as the very last one
      const otherStartingElements = elementsWithoutBoundary.filter(el => {
        const incoming = getIncomingElements(el, grid.isFlipped);

        const withOutLoops = [ ...incoming ].filter(resEl => resEl !== el);

        return (!grid.hasElement(el) && withOutLoops.length === 0);

      });

      let stack = [];
      let startingElements = [];

      if (startingElementsOnly.length > 0) {
        stack = [ ...startingElementsOnly ];
        startingElements = [ ...startingElementsOnly ];

        startingElements.forEach(el => {
          grid.add(el);
        });

      } else if (outgoingElementsInGrid.length > 0) {
        stack = [ ...outgoingElementsInGrid ];
      } else if (flippedOutgoingStart.length > 0) {

        stack = [ ...flippedOutgoingStart ];
        grid.flipHorizontally();
      } else if (outgoingFromGrid.length > 0) {
        stack = [ ...outgoingFromGrid ];
      } else if (otherStartingElements.length > 0) {
        stack = [ ...otherStartingElements ];
      } else {

        // just push the rest into the stack
        const allInGrid = grid.elements;
        const result = elements.filter(el => {
          return (![...allInGrid].some(item => item === el) && !isBoundaryEvent(el));
        });

        const withGridIncoming = result.filter(el => {
          const incoming = getIncomingElements(el, grid.isFlipped);
          const gridIncoming = [...incoming].filter(el => grid.hasElement(el));
          if (gridIncoming.length > 0) {
            return true;
          }
        });

        if (withGridIncoming.length > 0) {
          stack = [ ...withGridIncoming ];
          startingElements = [ ...withGridIncoming ];
        } else {
          stack.push(result[0]);
        }
      }

      this.handleGrid(grid , stack);

      // square after each pass
      grid.toRectangle();

    }

    // flip grid for reverse
    if (grid.isFlipped) {
      grid.flipHorizontally();
    }

    fixVerticalCrosses(grid)
    fixHorizontalCrosses(grid)
    return grid;
  }

  generateDi(root, layoutGrid) {
    const diFactory = this.diFactory;

    // Step 0: Create Root element
    const diagram = this.diagram;

    var planeDi = diFactory.createDiPlane({
      id: 'BPMNPlane_' + root.id,
      bpmnElement: root
    });
    var diagramDi = diFactory.createDiDiagram({
      id: 'BPMNDiagram_' + root.id,
      plane: planeDi
    });

    // deepest subprocess is added first - insert at the front
    diagram.diagrams.unshift(diagramDi);

    const planeElement = planeDi.get('planeElement');

    // Step 1: Create DI for all elements
    layoutGrid.elementsByPosition().forEach(({ element, row, col }) => {
      const dis = this
        .handle('createElementDi', { element, row, col, layoutGrid, diFactory })
        .flat();

      planeElement.push(...dis);
    });

    // Step 2: Create DI for all connections
    layoutGrid.elementsByPosition().forEach(({ element, row, col }) => {
      const dis = this
        .handle('createConnectionDi', { element, row, col, layoutGrid, diFactory })
        .flat();

      planeElement.push(...dis);
    });
  }

  handleGrid(grid, stack) {
    while (stack.length > 0) {
      const currentElement = stack.pop();

      if (is(currentElement, 'bpmn:SubProcess')) {
        this.handlePlane(currentElement);
      }

      const nextElements = this.handle('addToGrid', { element: currentElement, grid, stack});

      nextElements.flat().forEach(el => {
        stack.push(el);
      });
      grid.shrinkCols();
    }
  }

  getProcess() {
    return this.diagram.get('rootElements').find(el => el.$type === 'bpmn:Process');
  }

}

// Handlers
/**
 * Get incoming elements
 * @param element
 * @param {boolean=} isFlipped
 */
export function getIncomingElements(element, isFlipped) {
  return  !isFlipped ? new Set (utilsGetIncomingElements(element)) : new Set (utilsGetOutgoingElements(element).concat(getAttachedOutgoingElements(element)));
}

export function getOutgoingElements(element, isFlipped) {
  return  !isFlipped ? new Set (utilsGetOutgoingElements(element).concat(getAttachedOutgoingElements(element))) : new Set (utilsGetIncomingElements(element));
}

function fixVerticalCrosses(grid) {
  // получаем вертикальные пересечения
  const crossedElements = new Set()
  for (const gridElement of grid.elements) {

    const [gridElementRow, gridElementCol] = grid.find(gridElement);
    const outgoing = utilsGetOutgoingElements(gridElement)
    // Todo: подумать/порисовать что делать с boundary
    // Достаточно пройти все исходящие

    for (const outgoingElement of outgoing ) {
      const [outgoingElementRow, outgoingElementCol ] = grid.find(outgoingElement)
      // 12 часов
      if (gridElementRow > outgoingElementRow && gridElementCol === outgoingElementCol) {
        for (let rowIndex = outgoingElementRow + 1; rowIndex < outgoingElementCol; rowIndex++) {
          const candidate = grid.get(rowIndex, gridElementCol)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }

      //верхний правый сектор
      if (gridElementRow > outgoingElementRow && gridElementCol < outgoingElementCol) {
        for (let rowIndex = outgoingElementRow + 1; rowIndex <= gridElementRow; rowIndex++) {
          const candidate = grid.get(rowIndex, outgoingElementCol)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }

      // нижний правый сектор
      if (gridElementRow < outgoingElementRow && gridElementCol < outgoingElementCol) {
        for (let rowIndex = gridElementRow + 1; rowIndex <= outgoingElementRow; rowIndex++) {
          const candidate = grid.get(rowIndex, gridElementCol)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }

      // 6 часов
      if (gridElementRow < outgoingElementRow && gridElementCol === outgoingElementCol) {
        for (let rowIndex = gridElementRow + 1; rowIndex < outgoingElementRow; rowIndex++) {
          const candidate = grid.get(rowIndex, gridElementCol)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }

      //левый низ
      if (gridElementRow < outgoingElementRow && gridElementCol > outgoingElementCol) {
        for (let rowIndex = gridElementRow; rowIndex < outgoingElementRow; rowIndex++) {
          const candidate = grid.get(rowIndex, outgoingElementCol)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }

      // 9 часов не рассматриваем для вертикального кейса

      // левый верх
      if (gridElementRow > outgoingElementRow && gridElementCol > outgoingElementCol) {
        for (let rowIndex = outgoingElementRow; rowIndex < gridElementRow; rowIndex++) {
          const candidate = grid.get(rowIndex, gridElementCol)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }
    }

    const attachedOutgoing = getAttachedOutgoingElements(gridElement)
    for (const attachedOutgoingElement of attachedOutgoing) {
      const [attachedOutgoingElementRow, attachedOutgoingElementCol ] = grid.find(attachedOutgoingElement)

      // 12 часов не обрабатываем
      // правый верхний
      if (gridElementRow > attachedOutgoingElementRow && gridElementCol < attachedOutgoingElementCol) {
        for (let rowIndex = attachedOutgoingElementRow + 1; rowIndex <= gridElementRow; rowIndex++) {
          const candidate = grid.get(rowIndex, attachedOutgoingElementCol)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }

      // 3 часа не обрабатываем

      // нижний правый
      if (gridElementRow < attachedOutgoingElementRow && gridElementCol < attachedOutgoingElementCol) {
        for (let rowIndex = gridElementRow + 1; rowIndex <= attachedOutgoingElementRow; rowIndex++) {
          const candidate = grid.get(rowIndex, gridElementCol)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }

      // 6 часов
      if (gridElementRow < attachedOutgoingElementRow && gridElementCol === attachedOutgoingElementCol) {
        for (let rowIndex = gridElementRow + 1; rowIndex < attachedOutgoingElementRow; rowIndex++) {
          const candidate = grid.get(rowIndex, gridElementCol)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }

      //левый низ
      if (gridElementRow < attachedOutgoingElementRow && gridElementCol > attachedOutgoingElementCol) {
        for (let rowIndex = gridElementRow + 1; rowIndex < attachedOutgoingElementRow; rowIndex++) {
          const candidate = grid.get(rowIndex, attachedOutgoingElementCol)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }

      //9 часов нет

      //верхний левый тоже нет

    }
  }

  if (crossedElements.size === 0) return;

  for (let colIndex = grid.colCount - 1; colIndex >= 0; colIndex--) {

    const crossedRowsInCol = new Set()
    for (let rowIndex = 0; rowIndex < grid.rowCount; rowIndex++) {
      const candidate = grid.get(rowIndex, colIndex);
      if (crossedElements.has(candidate)) crossedRowsInCol.add(rowIndex);
    }

    if (crossedRowsInCol.size > 0) {
      //todo: убрать _grid
      grid._grid.forEach((row, rowIndex) => {
        if (crossedRowsInCol.has(rowIndex)){
          row.splice(colIndex + 1, 0, null)
        } else {
          row.splice(colIndex, 0, null)
        }
      })
    }

  }

}

function fixHorizontalCrosses(grid) {
  // получаем горизонтальные пересечения
  const crossedElements = new Set()
  for (const gridElement of grid.elements) {

    const [gridElementRow, gridElementCol] = grid.find(gridElement);
    const outgoing = utilsGetOutgoingElements(gridElement)

    for (const outgoingElement of outgoing ) {
      const [outgoingElementRow, outgoingElementCol ] = grid.find(outgoingElement)
      // 12 часов не обрабатываем

      //верхний правый сектор
      if (gridElementRow > outgoingElementRow && gridElementCol < outgoingElementCol) {
        for (let colIndex = gridElementCol + 1; colIndex <= outgoingElementCol; colIndex++) {
          const candidate = grid.get(gridElementRow, colIndex)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }

      // 3 час
      if (gridElementRow === outgoingElementRow && gridElementCol < outgoingElementCol) {
        for (let colIndex = gridElementCol + 1; colIndex < outgoingElementCol; colIndex++) {
          const candidate = grid.get(gridElementRow, colIndex)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }

      // нижний правый сектор
      if (gridElementRow < outgoingElementRow && gridElementCol < outgoingElementCol) {
        for (let colIndex = gridElementCol; colIndex < outgoingElementCol; colIndex++) {
          const candidate = grid.get(outgoingElementRow, colIndex)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }

      // 6 часов - нет

      //левый низ
      if (gridElementRow < outgoingElementRow && gridElementCol > outgoingElementCol) {
        for (let colIndex = outgoingElementCol; colIndex < gridElementCol; colIndex++) {
          const candidate = grid.get(gridElementRow, colIndex)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }

      // 9 часов
      if (gridElementRow === outgoingElementRow && gridElementCol > outgoingElementCol) {
        for (let colIndex = outgoingElementCol + 1; colIndex < gridElementCol; colIndex++) {
          const candidate = grid.get(gridElementRow, colIndex)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }

      // левый верх
      if (gridElementRow > outgoingElementRow && gridElementCol > outgoingElementCol) {
        for (let colIndex = outgoingElementCol + 1; colIndex <= gridElementCol; colIndex++) {
          const candidate = grid.get(outgoingElementRow, colIndex)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }
    }

    const attachedOutgoing = getAttachedOutgoingElements(gridElement)
    for (const attachedOutgoingElement of attachedOutgoing ) {
      const [attachedOutgoingElementRow, attachedOutgoingElementCol ] = grid.find(attachedOutgoingElement)
      // 12 часов не обрабатываем

      //верхний правый сектор - не обрабатываем

      // 3 час - не обрабатываем

      // нижний правый сектор
      if (gridElementRow < attachedOutgoingElementRow && gridElementCol < attachedOutgoingElementCol) {
        for (let colIndex = gridElementCol; colIndex < attachedOutgoingElementCol; colIndex++) {
          const candidate = grid.get(attachedOutgoingElementRow, colIndex)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }

      // 6 часов - нет
      //левый низ - нет
      // 9 часов - нет

      // левый верх
      if (gridElementRow > attachedOutgoingElementRow && gridElementCol > attachedOutgoingElementCol) {
        for (let colIndex = attachedOutgoingElementCol + 1; colIndex < gridElementCol; colIndex++) {
          const candidate = grid.get(attachedOutgoingElementCol, colIndex)
          if (candidate) {
            crossedElements.add(candidate);
          }
        }
      }
      // 12 - нет
    }

  }

  if (crossedElements.size === 0) return;
  // работаем с последней строки

  for (let rowIndex = grid.rowCount - 1; rowIndex >= 0; rowIndex--) {

    const crossedColsInRow = new Set()

    for (let colIndex = 0; colIndex < grid.colCount; colIndex++) {
      const candidate = grid.get(rowIndex, colIndex);
      if (crossedElements.has(candidate)) crossedColsInRow.add(colIndex);
    }

    if (crossedColsInRow.size > 0) {
      //Добавляем строку перед
      // todo: убрать _grid
      grid._grid.splice(rowIndex, 0, Array(grid.colCount));
      // поднимаем только пересечения
      for (const crossedCol of crossedColsInRow){
        const crossedElement = grid.get(rowIndex + 1, crossedCol);
        if (crossedElement){
          grid._grid[rowIndex][crossedCol] = crossedElement;
          grid._grid[rowIndex + 1][crossedCol] = null;
        }
      }
    }

  }

}

function getVerticalCrossedBy(element, grid) {

}
