export class Edge {
  constructor(source, target, grid, sourceIsBoundary) {
    // TODO: упасть с ошибкой если их нет в гриде?
    this._source = source;
    this._target = target;
    this._grid = grid;
    this._sourceIsBoundary = sourceIsBoundary;
  }

  get source(){
    return !this._grid.isFlipped ? this._source : this._target;
  }

  get target(){
    return !this._grid.isFlipped ? this._target : this._source;
  }

  get sourcePosition() {
    return !this._grid.isFlipped ? this._grid.find(this._source) : this._grid.find(this._target)
  }

  get targetPosition() {
    return !this._grid.isFlipped ? this._grid.find(this._target) : this._grid.find(this._source)
  }

  /**
   * Здесь уже НЕ надо использовать реверс, так как работаем с геттерами, которые уже делают расчет по флипу
   * @returns {Direction}
   */
  get direction() {
    return  this.getDirection(this.sourcePosition, this.targetPosition);
  }

  /**
   *
   * @param {Array<PathSegment>} pathSegments
   * @returns {Array<PathSegment>}
   * @private
   */
  _normalizePathCols(pathSegments) {
    if (!this._grid.isFlipped) return pathSegments

    const maxColIndex = this._grid.colCount - 1

    for (const segment of pathSegments) {
      segment.position[1] = maxColIndex - segment.position[1]
    }

    return pathSegments
  }

  _pathForNoDirection() {
    return [];
  }

  _pathForSouthToNorth() {
    const pathSegments = []
    const [sourceRow, sourceCol] = this.sourcePosition
    const [targetRow, targetCol] = this.targetPosition

    //если sourceIsBoundary, то сразу идем в обход, так же для реверса
    if (this._sourceIsBoundary) return pathSegments

    //TODO: при реверсе флипать сегменты перед отдачей

    // проверяем есть ли элементы между sourcePosition, targetPosition
    // если есть, то ребро пойдет в обход
    // так же оно пойдет в обход если элементы на соседних клетках и есть обратное ребро targetPosition-sourcePosition
    let hasIntermediateElements =  this._grid.hasIntermediateElements(this.sourcePosition, this.targetPosition, true)
    // идем между ячейками грида
    if (hasIntermediateElements) return pathSegments

    //проверяем петлю source -> target -> source
    const targetElementOutgoingEdges = this._grid.getExistingOutgoingEdgesFor(this.target)
    const targetElementOutgoing = [...targetElementOutgoingEdges].map(edge => edge.target)
    // идем в обход если есть ребро в противоположном направлении
    if (targetElementOutgoing.includes(this.source)) return pathSegments

    // в остальных случаях идем прямо
    // TODO: вопрос что с реверсом ПОКА ТАК
    for (let rowIndex = sourceRow - 1; rowIndex > targetRow; rowIndex--) {
      pathSegments.push({position: [rowIndex, sourceCol], vCross: true})
    }
    return !this._grid.isFlipped ? pathSegments : this._normalizePathCols(pathSegments.reverse())
  }

  _pathForSouthWestToNorthEast() {
    const pathSegments = []
    const [sourceRow, sourceCol] = this.sourcePosition
    const [targetRow, targetCol] = this.targetPosition

    //если sourceIsBoundary, то пропускаем горизонтальную часть
    if (!this._sourceIsBoundary) {
      //move right then up
      for (let colIndex = sourceCol + 1; colIndex < targetCol; colIndex++) {
        pathSegments.push({position: [sourceRow, colIndex], hCross: true})
      }
    }

    pathSegments.push({position: [sourceRow, targetCol], hCross: true, vCross: true})

    for (let rowIndex = sourceRow - 1; rowIndex > targetRow; rowIndex--) {
      pathSegments.push({position: [rowIndex, targetCol], vCross: true})
    }
    return !this._grid.isFlipped ? pathSegments : this._normalizePathCols(pathSegments.reverse())
  }

  _pathForWestToEast() {
    const pathSegments = []
    const [sourceRow, sourceCol] = this.sourcePosition
    const [targetRow, targetCol] = this.targetPosition

    // всегда идем вперед
    // пропускаем если sourceIsBoundary
    if (this._sourceIsBoundary) return pathSegments

    for (let colIndex = sourceCol + 1; colIndex < targetCol; colIndex++) {
      pathSegments.push({position: [sourceRow, colIndex], hCross: true})
    }

    return !this._grid.isFlipped ? pathSegments : this._normalizePathCols(pathSegments.reverse())
  }

  _pathForNorthWestToSouthEast() {
    const pathSegments = []
    const [sourceRow, sourceCol] = this.sourcePosition
    const [targetRow, targetCol] = this.targetPosition

    // идем сначала вниз, потом вправо так же и для sourceIsBoundary
    for (let rowIndex = sourceRow + 1; rowIndex < targetRow; rowIndex++) {
      pathSegments.push({position: [rowIndex, sourceCol], vCross: true})
    }
    pathSegments.push({position: [targetRow, sourceCol], vCross: true, hCross: true})

    for (let colIndex = sourceCol + 1; colIndex < targetCol; colIndex++) {
      pathSegments.push({position: [targetRow, colIndex], hCross: true})
    }
    return !this._grid.isFlipped ? pathSegments : this._normalizePathCols(pathSegments.reverse())
  }

  _pathForNorthToSouth() {
    const pathSegments = []
    const [sourceRow, sourceCol] = this.sourcePosition
    const [targetRow, targetCol] = this.targetPosition

    // всегда идем вниз так же и для sourceIsBoundary
    for (let rowIndex = sourceRow + 1; rowIndex < targetRow; rowIndex++) {
      pathSegments.push({position: [rowIndex, sourceCol], vCross: true})
    }
    return !this._grid.isFlipped ? pathSegments : this._normalizePathCols(pathSegments.reverse())
  }

  _pathForNorthEastToSouthWest() {
    const pathSegments = []
    const [sourceRow, sourceCol] = this.sourcePosition
    const [targetRow, targetCol] = this.targetPosition

    // идем вниз потом налево так же и для sourceIsBoundary
    for (let rowIndex = sourceRow + 1; rowIndex < targetRow; rowIndex++) {
      pathSegments.push({position: [rowIndex, sourceCol], vCross: true})
    }

    pathSegments.push({position: [targetRow, sourceCol], vCross: true, hCross: true})

    for (let colIndex = sourceCol - 1; colIndex > targetCol; colIndex--) {
      pathSegments.push({position: [targetRow, colIndex], hCross: true})
    }

    return !this._grid.isFlipped ? pathSegments : this._normalizePathCols(pathSegments.reverse())
  }

  _pathForEastToWest() {
    const pathSegments = []
    const [sourceRow, sourceCol] = this.sourcePosition
    const [targetRow, targetCol] = this.targetPosition

    // здесь аналогично движению вверх
    // проверяем есть ли элементы между sourcePosition, targetPosition
    // если есть, то ребро пойдет в обход
    // так же оно пойдет в обход если элементы на соседних клетках и есть обратное ребро targetPosition-sourcePosition
    // для sourceIsBoundary всегда пропускаем
    if (this._sourceIsBoundary) return pathSegments

    let hasIntermediateElements =  this._grid.hasIntermediateElements(this.sourcePosition, this.targetPosition, false)
    // идем между ячейками грида
    if (hasIntermediateElements) return pathSegments

    let targetElementOutgoing = this._grid.getExistingOutgoingEdgesFor(this.target)
    targetElementOutgoing = [...targetElementOutgoing].map(item => item.target)
    // идем в обход если есть ребро в противоположном направлении
    if (targetElementOutgoing.includes(this.source)) return pathSegments

    for (let colIndex = sourceCol - 1; colIndex > targetCol; colIndex--) {
      pathSegments.push({position: [sourceRow, colIndex], hCross: true})
    }

    return !this._grid.isFlipped ? pathSegments : this._normalizePathCols(pathSegments.reverse())
  }

  _pathForSouthEastToNorthWest() {
    const pathSegments = []
    const [sourceRow, sourceCol] = this.sourcePosition
    const [targetRow, targetCol] = this.targetPosition

    // для sourceIsBoundary пропускаем горизонталь
    if (!this._sourceIsBoundary) {
      // пробуем новую схему для хост-хост без обхода
      for (let colIndex = sourceCol - 1; colIndex > targetCol; colIndex--) {
        pathSegments.push({position: [sourceRow, colIndex], hCross: true})
      }
    }

    // угловой сегмент
    if (!this._sourceIsBoundary) {
      pathSegments.push({position: [sourceRow, targetCol], hCross: true, vCross: true})
    } else {
      pathSegments.push({position: [sourceRow, targetCol], vCross: true})
    }

    // идем наверх
    for (let rowIndex = sourceRow - 1; rowIndex > targetRow; rowIndex--) {
      pathSegments.push({position: [rowIndex, targetCol], vCross: true})
    }
    return !this._grid.isFlipped ? pathSegments : this._normalizePathCols(pathSegments.reverse())
  }

  /**
   * @returns {Array<PathSegment>}
   */
  get path () {
    if (this.direction === 'NO_DIRECTION') return this._pathForNoDirection()
    if (this.direction === 'S_N')  return this._pathForSouthToNorth()
    if (this.direction === 'SW_NE') return this._pathForSouthWestToNorthEast()
    if (this.direction === 'W_E') return this._pathForWestToEast()
    if (this.direction === 'NW_SE') return this._pathForNorthWestToSouthEast()
    if (this.direction === 'N_S')  return this._pathForNorthToSouth()
    if (this.direction === 'NE_SW') return this._pathForNorthEastToSouthWest()
    if (this.direction === 'E_W') return this._pathForEastToWest()
    if (this.direction === 'SE_NW') return this._pathForSouthEastToNorthWest()
    return []
  }

  /**
   *
   * @param {boolean} byVertical
   */
  crossedElements (byVertical) {
    const crossedElements = []
    for (const segment of this.path) {
      const [row, col ] = segment.position
      const element = this._grid.get(row, col)
      if (element && ((byVertical && segment.vCross) || (!byVertical && segment.hCross))) crossedElements.push(element)
    }
    return crossedElements
  }

  /**
   *
   * @param {boolean} byVertical
   */
  crossedElementsPositions (byVertical) {
    const crossedPositions = []
    for (const segment of this.path) {
      const [row, col ] = segment.position
      const element = this._grid.get(row, col)
      if (element && ((byVertical && segment.vCross) || (!byVertical && segment.hCross))) crossedPositions.push([row, col ])
    }
    return crossedPositions
  }

  /**
   * @typedef {('S_N' | 'SW_NE' | 'W_E' | 'NW_SE' | 'N_S' | 'NE_SW' | 'E_W' | 'SE_NW' | 'NO_DIRECTION')} Direction
   * - **S_N** - south to north
   * - **SW_NE** - south-west to north-east
   * - **W_E** - west to east
   * - **NW_SE** - north-west to south-east
   * - **N_S** - north to south
   * - **NE_SW** - north-east to south-west
   * - **E_W** - east to west
   * - **SE_NW** - south-east to north-west
   * - **NO_DIRECTION** - if it's not a vector but a point
   */

  /**
   * Return 1 of 8 directions for 'vector' or 'POINT'
   * @param {Position} sourcePosition
   * @param {Position} targetPosition
   * @returns {Direction}
   */
  getDirection(sourcePosition, targetPosition) {
    if (!this._grid.isValidPosition(sourcePosition) || !this._grid.isValidPosition(targetPosition)) return 'NO_DIRECTION';

    const [sourceRow, sourceCol] = sourcePosition
    const [targetRow, targetCol] = targetPosition

    const vDifference = sourceRow - targetRow;
    const hDifference = sourceCol - targetCol;

    // south to north
    if (vDifference > 0 && hDifference === 0) return 'S_N';

    // south-west to north-east
    if (vDifference > 0 && hDifference < 0) return 'SW_NE'

    // west to east
    if (vDifference === 0 && hDifference < 0) return 'W_E'

    // north-west to south-east
    if (vDifference < 0 && hDifference < 0) return 'NW_SE'

    // north to south
    if (vDifference < 0 && hDifference === 0) return 'N_S'

    // north-east to south-west
    if (sourceRow < targetRow && sourceCol > targetCol) return 'NE_SW'

    // east to west
    if (sourceRow === targetRow && sourceCol > targetCol) return 'E_W'

    // south-east to north-west
    if (sourceRow > targetRow && sourceCol > targetCol) return 'SE_NW'
  }
}