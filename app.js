const UNKNOWN = -1;
const EMPTY = 0;
const FILLED = 1;
const MIN_GRID_SIZE = 5;
const MAX_GRID_SIZE = 15;
const SOLVER_YIELD_EVERY = 120;

const elements = {
  themeToggle: document.querySelector("#theme-toggle"),
  clueModeButton: document.querySelector("#clue-mode-button"),
  drawModeButton: document.querySelector("#draw-mode-button"),
  clueModePanel: document.querySelector("#clue-mode-panel"),
  drawModePanel: document.querySelector("#draw-mode-panel"),
  rowClues: document.querySelector("#row-clues"),
  columnClues: document.querySelector("#column-clues"),
  builderRows: document.querySelector("#builder-rows"),
  builderColumns: document.querySelector("#builder-columns"),
  newDrawing: document.querySelector("#new-drawing"),
  drawFill: document.querySelector("#draw-fill"),
  drawErase: document.querySelector("#draw-erase"),
  clearDrawing: document.querySelector("#clear-drawing"),
  builderGrid: document.querySelector("#builder-grid"),
  useDrawing: document.querySelector("#use-drawing"),
  solveButton: document.querySelector("#solve-button"),
  resetButton: document.querySelector("#reset-button"),
  message: document.querySelector("#message"),
  sizeStat: document.querySelector("#size-stat"),
  filledStat: document.querySelector("#filled-stat"),
  passStat: document.querySelector("#pass-stat"),
  branchStat: document.querySelector("#branch-stat"),
  drawStage: document.querySelector("#draw-stage"),
  solutionStage: document.querySelector("#solution-stage"),
  puzzleFrame: document.querySelector("#puzzle-frame"),
  columnRail: document.querySelector("#column-rail"),
  rowRail: document.querySelector("#row-rail"),
  boardGrid: document.querySelector("#board-grid"),
  traceList: document.querySelector("#trace-list"),
};

const appState = {
  rowClues: [],
  columnClues: [],
  grid: [],
  builderGrid: [],
  currentMode: "clues",
  drawTool: FILLED,
  isDrawing: false,
  paintValue: FILLED,
  stageView: "draw",
  lastResult: null,
};

function cluesFromGrid(grid) {
  const rows = grid.map((row) => cluesFromCells(row));
  const columns = Array.from({ length: grid[0].length }, (_, columnIndex) =>
    cluesFromCells(grid.map((row) => row[columnIndex]))
  );

  return { rows, columns };
}

function cluesFromCells(cells) {
  const clues = [];
  let run = 0;

  for (const cell of cells) {
    if (cell === FILLED) {
      run += 1;
    } else if (run > 0) {
      clues.push(run);
      run = 0;
    }
  }

  if (run > 0) {
    clues.push(run);
  }

  return clues;
}

function cluesToText(clues) {
  return clues.map((line) => (line.length ? line.join(" ") : "0")).join("\n");
}

function parseClueText(value, axisName) {
  const lines = value.replace(/\r/g, "").split("\n");
  while (lines.length && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  const clues = [];

  lines.forEach((line, index) => {
    const normalized = line.trim().replace(/[;,|]+/g, " ");

    if (!normalized || normalized === "0") {
      clues.push([]);
      return;
    }

    const numbers = normalized.split(/\s+/).map((part) => Number(part));
    const invalid = numbers.find((number) => !Number.isInteger(number) || number <= 0);

    if (invalid !== undefined) {
      throw new Error(`${axisName} clue ${index + 1} contains an invalid number.`);
    }

    clues.push(numbers);
  });

  return clues;
}

function validateClues(rowClues, columnClues) {
  const rowCount = rowClues.length;
  const columnCount = columnClues.length;

  if (!rowCount || !columnCount) {
    throw new Error("Add at least one row clue and one column clue.");
  }

  if (rowCount < MIN_GRID_SIZE || columnCount < MIN_GRID_SIZE) {
    throw new Error(`Puzzle size must be at least ${MIN_GRID_SIZE} x ${MIN_GRID_SIZE}.`);
  }

  if (rowCount > MAX_GRID_SIZE || columnCount > MAX_GRID_SIZE) {
    throw new Error(`Puzzle size cannot be larger than ${MAX_GRID_SIZE} x ${MAX_GRID_SIZE}.`);
  }

  rowClues.forEach((clue, index) => {
    if (minimumLineLength(clue) > columnCount) {
      throw new Error(`Row ${index + 1} cannot fit inside ${columnCount} columns.`);
    }
  });

  columnClues.forEach((clue, index) => {
    if (minimumLineLength(clue) > rowCount) {
      throw new Error(`Column ${index + 1} cannot fit inside ${rowCount} rows.`);
    }
  });
}

function minimumLineLength(clue) {
  if (!clue.length) {
    return 0;
  }

  return clue.reduce((sum, item) => sum + item, 0) + clue.length - 1;
}

function createUnknownGrid(rowCount, columnCount) {
  return Array.from({ length: rowCount }, () => Array(columnCount).fill(UNKNOWN));
}

function createSolidGrid(rowCount, columnCount, value) {
  return Array.from({ length: rowCount }, () => Array(columnCount).fill(value));
}

function generateLineCandidates(length, clues, knownLine = Array(length).fill(UNKNOWN)) {
  if (!clues.length) {
    const candidate = Array(length).fill(EMPTY);
    return compatibleLine(candidate, knownLine) ? [candidate] : [];
  }

  const candidates = [];

  function minimumRemaining(blockIndex) {
    if (blockIndex >= clues.length) {
      return 0;
    }

    const blockTotal = clues.slice(blockIndex).reduce((sum, item) => sum + item, 0);
    return blockTotal + (clues.length - blockIndex - 1);
  }

  function placeBlock(blockIndex, cursor, cells) {
    if (blockIndex === clues.length) {
      const candidate = [...cells, ...Array(length - cells.length).fill(EMPTY)];
      if (compatibleLine(candidate, knownLine)) {
        candidates.push(candidate);
      }
      return;
    }

    const blockSize = clues[blockIndex];
    const maxStart = length - minimumRemaining(blockIndex);

    for (let start = cursor; start <= maxStart; start += 1) {
      const nextCells = [
        ...cells,
        ...Array(start - cells.length).fill(EMPTY),
        ...Array(blockSize).fill(FILLED),
      ];

      if (blockIndex < clues.length - 1) {
        nextCells.push(EMPTY);
        placeBlock(blockIndex + 1, nextCells.length, nextCells);
      } else {
        placeBlock(blockIndex + 1, nextCells.length, nextCells);
      }
    }
  }

  placeBlock(0, 0, []);
  return candidates;
}

function compatibleLine(candidate, knownLine) {
  return candidate.every((cell, index) => knownLine[index] === UNKNOWN || knownLine[index] === cell);
}

function cloneState(state) {
  return {
    grid: state.grid.map((row) => [...row]),
    rowClues: state.rowClues,
    columnClues: state.columnClues,
    rowCandidates: [],
    columnCandidates: [],
  };
}

function createSolverState(rowClues, columnClues) {
  const rowCount = rowClues.length;
  const columnCount = columnClues.length;

  return {
    grid: createUnknownGrid(rowCount, columnCount),
    rowClues,
    columnClues,
    rowCandidates: Array.from({ length: rowCount }, () => []),
    columnCandidates: Array.from({ length: columnCount }, () => []),
  };
}

async function solvePuzzle(rowClues, columnClues) {
  const trace = [];
  const meta = {
    passes: 0,
    branches: 0,
    nodes: 0,
    timedOut: false,
  };

  const initialState = createSolverState(rowClues, columnClues);
  const solvedState = await search(initialState, trace, meta, 0);

  if (!solvedState) {
    return {
      status: meta.timedOut ? "limit" : "contradiction",
      grid: initialState.grid,
      trace,
      meta,
    };
  }

  const solved = isSolved(solvedState.grid);
  return {
    status: solved ? "solved" : "partial",
    grid: solvedState.grid,
    trace,
    meta,
  };
}

function solveInWorker(rowClues, columnClues) {
  const solverFunctions = [
    createUnknownGrid, generateLineCandidates, compatibleLine, cloneState,
    createSolverState, solvePuzzle, search, propagate, reduceRows,
    reduceColumns, forcedCells, isSolved, chooseCell, valueSupport,
  ];
  const source = `const UNKNOWN=${UNKNOWN}, EMPTY=${EMPTY}, FILLED=${FILLED};
    const SOLVER_YIELD_EVERY=${SOLVER_YIELD_EVERY};
    const window=self;
    ${solverFunctions.map((fn) => fn.toString()).join("\n")}
    self.onmessage=async ({data})=>{try{self.postMessage(await solvePuzzle(data.rows,data.columns))}catch(error){self.postMessage({error:error.message})}};`;
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));

  return new Promise((resolve, reject) => {
    const worker = new Worker(url);
    worker.onmessage = ({ data }) => {
      worker.terminate();
      URL.revokeObjectURL(url);
      data.error ? reject(new Error(data.error)) : resolve(data);
    };
    worker.onerror = (error) => {
      worker.terminate();
      URL.revokeObjectURL(url);
      reject(error);
    };
    worker.postMessage({ rows: rowClues, columns: columnClues });
  });
}

async function search(state, trace, meta, depth) {
  meta.nodes += 1;
  if (meta.nodes % SOLVER_YIELD_EVERY === 0) {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  const propagation = propagate(state, trace, meta, depth);
  if (!propagation.ok) {
    return null;
  }

  if (isSolved(state.grid)) {
    return state;
  }

  const choice = chooseCell(state);
  if (!choice) {
    return state;
  }

  meta.branches += 1;
  trace.push({
    title: `Branch ${meta.branches}`,
    text: `Testing row ${choice.row + 1}, column ${choice.column + 1}.`,
  });

  for (const value of choice.values) {
    const nextState = cloneState(state);
    nextState.grid[choice.row][choice.column] = value;
    const solved = await search(nextState, trace, meta, depth + 1);

    if (solved) {
      return solved;
    }

    if (meta.timedOut) {
      return null;
    }
  }

  return null;
}

function propagate(state, trace, meta, depth) {
  let changed = true;

  while (changed) {
    changed = false;
    meta.passes += 1;

    const rowResult = reduceRows(state);
    if (!rowResult.ok) {
      trace.push({ title: "Contradiction", text: rowResult.message });
      return { ok: false };
    }

    const columnResult = reduceColumns(state);
    if (!columnResult.ok) {
      trace.push({ title: "Contradiction", text: columnResult.message });
      return { ok: false };
    }

    const updates = [...rowResult.updates, ...columnResult.updates];

    if (updates.length) {
      changed = true;
      const prefix = depth ? `Depth ${depth}` : `Pass ${meta.passes}`;
      trace.push({
        title: prefix,
        text: `${updates.length} cell${updates.length === 1 ? "" : "s"} resolved.`,
      });
    }
  }

  return { ok: true };
}

function reduceRows(state) {
  const updates = [];

  for (let row = 0; row < state.grid.length; row += 1) {
    const knownLine = state.grid[row];
    const candidates = generateLineCandidates(knownLine.length, state.rowClues[row], knownLine);

    if (!candidates.length) {
      return { ok: false, message: `Row ${row + 1} has no legal patterns.`, updates };
    }

    state.rowCandidates[row] = candidates;
    const forced = forcedCells(candidates);

    forced.forEach((value, column) => {
      if (value !== UNKNOWN && state.grid[row][column] === UNKNOWN) {
        state.grid[row][column] = value;
        updates.push({ row, column, value });
      }
    });
  }

  return { ok: true, updates };
}

function reduceColumns(state) {
  const updates = [];
  const rowCount = state.grid.length;
  const columnCount = state.grid[0].length;

  for (let column = 0; column < columnCount; column += 1) {
    const knownLine = Array.from({ length: rowCount }, (_, row) => state.grid[row][column]);
    const candidates = generateLineCandidates(rowCount, state.columnClues[column], knownLine);

    if (!candidates.length) {
      return { ok: false, message: `Column ${column + 1} has no legal patterns.`, updates };
    }

    state.columnCandidates[column] = candidates;
    const forced = forcedCells(candidates);

    forced.forEach((value, row) => {
      if (value !== UNKNOWN && state.grid[row][column] === UNKNOWN) {
        state.grid[row][column] = value;
        updates.push({ row, column, value });
      }
    });
  }

  return { ok: true, updates };
}

function forcedCells(candidates) {
  const width = candidates[0].length;
  const forced = Array(width).fill(UNKNOWN);

  for (let index = 0; index < width; index += 1) {
    const firstValue = candidates[0][index];
    if (candidates.every((candidate) => candidate[index] === firstValue)) {
      forced[index] = firstValue;
    }
  }

  return forced;
}

function isSolved(grid) {
  return grid.every((row) => row.every((cell) => cell !== UNKNOWN));
}

function chooseCell(state) {
  let best = null;

  state.grid.forEach((rowCells, row) => {
    rowCells.forEach((cell, column) => {
      if (cell !== UNKNOWN) {
        return;
      }

      const values = [FILLED, EMPTY].filter((value) => {
        const rowSupport = state.rowCandidates[row].some((candidate) => candidate[column] === value);
        const columnSupport = state.columnCandidates[column].some(
          (candidate) => candidate[row] === value
        );
        return rowSupport && columnSupport;
      });

      const support = values.reduce((sum, value) => {
        const rowCount = state.rowCandidates[row].filter((candidate) => candidate[column] === value)
          .length;
        const columnCount = state.columnCandidates[column].filter(
          (candidate) => candidate[row] === value
        ).length;
        return sum + rowCount + columnCount;
      }, 0);

      const score = values.length * 100000 + support;

      if (!best || score < best.score) {
        best = {
          row,
          column,
          values,
          score,
        };
      }
    });
  });

  if (!best) {
    return null;
  }

  best.values.sort((a, b) => valueSupport(state, best.row, best.column, b) - valueSupport(state, best.row, best.column, a));
  return best;
}

function valueSupport(state, row, column, value) {
  const rowCount = state.rowCandidates[row].filter((candidate) => candidate[column] === value)
    .length;
  const columnCount = state.columnCandidates[column].filter((candidate) => candidate[row] === value)
    .length;
  return rowCount + columnCount;
}

function switchMode(mode) {
  appState.currentMode = mode;
  const drawMode = mode === "draw";

  elements.clueModeButton.classList.toggle("active", !drawMode);
  elements.drawModeButton.classList.toggle("active", drawMode);
  elements.clueModeButton.setAttribute("aria-selected", String(!drawMode));
  elements.drawModeButton.setAttribute("aria-selected", String(drawMode));
  elements.clueModePanel.classList.toggle("hidden", drawMode);
  elements.drawModePanel.classList.toggle("hidden", !drawMode);

  showStage(drawMode ? "draw" : "solution");
}

function showStage(stageView) {
  appState.stageView = stageView;
  const drawing = stageView === "draw";

  elements.drawStage.classList.toggle("hidden", !drawing);
  elements.solutionStage.classList.toggle("hidden", drawing);
}

function applyTheme(theme) {
  const dark = theme === "dark";

  document.body.dataset.theme = theme;
  elements.themeToggle.textContent = dark ? "Light" : "Dark";
  elements.themeToggle.setAttribute("aria-pressed", String(dark));
  saveTheme(theme);
}

function initializeTheme() {
  const savedTheme = readSavedTheme();
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const theme = savedTheme || (prefersDark ? "dark" : "light");

  applyTheme(theme);
}

function toggleTheme() {
  const currentTheme = document.body.dataset.theme === "dark" ? "dark" : "light";
  applyTheme(currentTheme === "dark" ? "light" : "dark");
}

function readSavedTheme() {
  try {
    return window.localStorage?.getItem("picross-theme");
  } catch {
    return null;
  }
}

function saveTheme(theme) {
  try {
    window.localStorage?.setItem("picross-theme", theme);
  } catch {
    return;
  }
}

function setDrawTool(tool) {
  appState.drawTool = tool;
  const fillActive = tool === FILLED;

  elements.drawFill.classList.toggle("active", fillActive);
  elements.drawErase.classList.toggle("active", !fillActive);
  elements.drawFill.setAttribute("aria-pressed", String(fillActive));
  elements.drawErase.setAttribute("aria-pressed", String(!fillActive));
}

function clampGridSize(value, fallback) {
  const number = Number(value);

  if (!Number.isInteger(number)) {
    return fallback;
  }

  return Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, number));
}

function renderBuilderGrid() {
  const rows = appState.builderGrid.length;
  const columns = appState.builderGrid[0]?.length || 0;

  elements.builderGrid.style.setProperty("--builder-rows", rows);
  elements.builderGrid.style.setProperty("--builder-cols", columns);
  elements.builderGrid.innerHTML = "";

  appState.builderGrid.forEach((rowCells, row) => {
    rowCells.forEach((value, column) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `builder-cell${value === FILLED ? " filled" : ""}`;
      cell.dataset.row = String(row);
      cell.dataset.column = String(column);

      if ((column + 1) % 5 === 0 && column < columns - 1) {
        cell.classList.add("major-right");
      }

      if ((row + 1) % 5 === 0 && row < rows - 1) {
        cell.classList.add("major-bottom");
      }

      updateBuilderCellLabel(cell, row, column, value);
      elements.builderGrid.append(cell);
    });
  });
}

function syncSizeInputs(rows, columns) {
  elements.builderRows.value = String(rows);
  elements.builderColumns.value = String(columns);
}

function updateBuilderCellLabel(cell, row, column, value) {
  cell.setAttribute(
    "aria-label",
    `Drawing row ${row + 1}, column ${column + 1}: ${value === FILLED ? "filled" : "empty"}`
  );
}

function createNewDrawing() {
  const rows = clampGridSize(elements.builderRows.value, appState.builderGrid.length || 10);
  const columns = clampGridSize(elements.builderColumns.value, appState.builderGrid[0]?.length || 10);

  syncSizeInputs(rows, columns);
  appState.builderGrid = createSolidGrid(rows, columns, EMPTY);
  appState.rowClues = Array.from({ length: rows }, () => []);
  appState.columnClues = Array.from({ length: columns }, () => []);
  appState.grid = createUnknownGrid(rows, columns);
  appState.lastResult = null;

  elements.rowClues.value = cluesToText(appState.rowClues);
  elements.columnClues.value = cluesToText(appState.columnClues);
  renderBuilderGrid();
  renderPuzzle(appState.grid, appState.rowClues, appState.columnClues);
  if (appState.currentMode === "draw") {
    showStage("draw");
  }
  renderStats(appState.grid);
  renderTrace([]);
  setMessage(`${rows} x ${columns} puzzle ready.`);
}

function clearDrawing() {
  const rows = appState.builderGrid.length || 10;
  const columns = appState.builderGrid[0]?.length || 10;

  appState.builderGrid = createSolidGrid(rows, columns, EMPTY);
  renderBuilderGrid();
  applyDrawingToClues({ silent: true });
  setMessage("Drawing cleared.");
}

function applyDrawingToClues({ silent = false } = {}) {
  if (!appState.builderGrid.length || !appState.builderGrid[0]?.length) {
    createNewDrawing();
  }

  const clues = cluesFromGrid(appState.builderGrid);
  appState.rowClues = clues.rows;
  appState.columnClues = clues.columns;
  appState.grid = createUnknownGrid(clues.rows.length, clues.columns.length);
  appState.lastResult = null;

  syncSizeInputs(clues.rows.length, clues.columns.length);
  elements.rowClues.value = cluesToText(clues.rows);
  elements.columnClues.value = cluesToText(clues.columns);
  renderPuzzle(appState.grid, appState.rowClues, appState.columnClues);
  if (!silent) {
    showStage("solution");
  }
  renderStats(appState.grid);
  renderTrace([]);

  if (!silent) {
    setMessage("Drawing converted into Picross clues.");
  }
}

function paintBuilderCell(row, column, value, cell) {
  if (!appState.builderGrid[row] || appState.builderGrid[row][column] === undefined) {
    return;
  }

  appState.builderGrid[row][column] = value;

  if (cell) {
    cell.classList.toggle("filled", value === FILLED);
    updateBuilderCellLabel(cell, row, column, value);
  }
}

function handleBuilderPointer(event) {
  const cell = event.target.closest(".builder-cell");

  if (!cell) {
    return;
  }

  event.preventDefault();
  const row = Number(cell.dataset.row);
  const column = Number(cell.dataset.column);
  paintBuilderCell(row, column, appState.paintValue, cell);
}

function beginBuilderPaint(event) {
  const cell = event.target.closest(".builder-cell");

  if (!cell) {
    return;
  }

  appState.isDrawing = true;
  appState.paintValue = appState.drawTool;
  handleBuilderPointer(event);
}

function handleBuilderHover(event) {
  if (!appState.isDrawing) {
    return;
  }

  handleBuilderPointer(event);
}

function toggleBuilderCell(event) {
  const cell = event.target.closest(".builder-cell");

  if (!cell || (event.key !== "Enter" && event.key !== " ")) {
    return;
  }

  event.preventDefault();
  const row = Number(cell.dataset.row);
  const column = Number(cell.dataset.column);
  const nextValue = appState.builderGrid[row][column] === FILLED ? EMPTY : FILLED;
  paintBuilderCell(row, column, nextValue, cell);
}

function renderPuzzle(grid, rowClues, columnClues, recentCells = []) {
  const rows = grid.length;
  const columns = grid[0]?.length || 0;
  const recent = new Set(recentCells.map(({ row, column }) => `${row}:${column}`));

  elements.puzzleFrame.style.setProperty("--rows", rows);
  elements.puzzleFrame.style.setProperty("--cols", columns);

  elements.columnRail.innerHTML = "";
  columnClues.forEach((clue) => {
    const clueCell = document.createElement("div");
    clueCell.className = "column-clue";
    const clueStack = document.createElement("span");
    const values = clue.length ? clue : [0];
    values.forEach((value) => {
      const item = document.createElement("span");
      item.textContent = value;
      clueStack.append(item);
    });
    clueCell.append(clueStack);
    elements.columnRail.append(clueCell);
  });

  elements.rowRail.innerHTML = "";
  rowClues.forEach((clue) => {
    const clueCell = document.createElement("div");
    clueCell.className = "row-clue";
    clueCell.textContent = clue.length ? clue.join(" ") : "0";
    elements.rowRail.append(clueCell);
  });

  elements.boardGrid.innerHTML = "";
  grid.forEach((rowCells, row) => {
    rowCells.forEach((value, column) => {
      const cell = document.createElement("span");
      cell.className = `cell ${cellClass(value)}`;
      if ((column + 1) % 5 === 0 && column < rowCells.length - 1) {
        cell.classList.add("major-right");
      }
      if ((row + 1) % 5 === 0 && row < grid.length - 1) {
        cell.classList.add("major-bottom");
      }
      if (recent.has(`${row}:${column}`)) {
        cell.classList.add("recent");
      }
      cell.setAttribute("aria-label", `Row ${row + 1}, column ${column + 1}: ${cellLabel(value)}`);
      cell.append(document.createElement("span"));
      elements.boardGrid.append(cell);
    });
  });
}

function cellClass(value) {
  if (value === FILLED) {
    return "filled";
  }

  if (value === EMPTY) {
    return "empty";
  }

  return "unknown";
}

function cellLabel(value) {
  if (value === FILLED) {
    return "filled";
  }

  if (value === EMPTY) {
    return "empty";
  }

  return "unknown";
}

function renderStats(grid, result = null) {
  const rowCount = grid.length;
  const columnCount = grid[0]?.length || 0;
  const filled = grid.flat().filter((cell) => cell === FILLED).length;

  elements.sizeStat.textContent = rowCount && columnCount ? `${rowCount} x ${columnCount}` : "-";
  elements.filledStat.textContent = rowCount && columnCount ? String(filled) : "-";
  elements.passStat.textContent = result ? String(result.meta.passes) : "-";
  elements.branchStat.textContent = result ? String(result.meta.branches) : "-";
}

function renderTrace(trace) {
  elements.traceList.innerHTML = "";
  const visibleTrace = trace.length
    ? trace.slice(-24)
    : [{ title: "Ready", text: "Choose a size, draw a puzzle, or edit the clues." }];

  visibleTrace.forEach((item) => {
    const entry = document.createElement("li");
    const title = document.createElement("strong");
    const text = document.createElement("span");
    title.textContent = item.title;
    text.textContent = item.text;
    entry.append(title, text);
    elements.traceList.append(entry);
  });
}

function setMessage(text, tone = "default") {
  elements.message.textContent = text;
  elements.message.classList.toggle("error", tone === "error");
  elements.message.classList.toggle("success", tone === "success");
}

function readCluesFromInputs() {
  const rowClues = parseClueText(elements.rowClues.value, "Row");
  const columnClues = parseClueText(elements.columnClues.value, "Column");
  validateClues(rowClues, columnClues);
  syncSizeInputs(rowClues.length, columnClues.length);

  if (
    appState.builderGrid.length !== rowClues.length ||
    appState.builderGrid[0]?.length !== columnClues.length
  ) {
    appState.builderGrid = createSolidGrid(rowClues.length, columnClues.length, EMPTY);
    renderBuilderGrid();
  }

  return { rowClues, columnClues };
}

function readCluesForActiveMode() {
  if (appState.currentMode === "draw") {
    applyDrawingToClues({ silent: true });
  }

  return readCluesFromInputs();
}

async function solveFromInputs() {

  try {
    const { rowClues, columnClues } = readCluesForActiveMode();
    appState.rowClues = rowClues;
    appState.columnClues = columnClues;
    appState.grid = createUnknownGrid(rowClues.length, columnClues.length);

    setMessage("Searching for a valid solution...");
    const result = await solveInWorker(rowClues, columnClues);
    appState.lastResult = result;
    appState.grid = result.grid;

    renderPuzzle(result.grid, rowClues, columnClues);
    showStage("solution");
    renderStats(result.grid, result);
    renderTrace(result.trace);
    reportResult(result);
  } catch (error) {
    setMessage(error.message, "error");
  }
}

function reportResult(result) {
  if (result.status === "solved") {
    setMessage(
      `Solved in ${result.meta.passes} pass${result.meta.passes === 1 ? "" : "es"} with ${result.meta.branches} branch${result.meta.branches === 1 ? "" : "es"}.`,
      "success"
    );
    return;
  }

  if (result.status === "limit") {
    setMessage("Search was interrupted before a solution was found.", "error");
    return;
  }

  if (result.status === "contradiction") {
    setMessage("No solution matches those clues.", "error");
    return;
  }

  setMessage("Solver found a partial state.", "error");
}

function resetCurrent() {

  try {
    const { rowClues, columnClues } = readCluesForActiveMode();
    appState.rowClues = rowClues;
    appState.columnClues = columnClues;
    appState.grid = createUnknownGrid(rowClues.length, columnClues.length);
    appState.lastResult = null;
    renderPuzzle(appState.grid, rowClues, columnClues);
    renderStats(appState.grid);
    renderTrace([]);
    setMessage("Board reset.");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

function initialize() {
  initializeTheme();
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.clueModeButton.addEventListener("click", () => switchMode("clues"));
  elements.drawModeButton.addEventListener("click", () => switchMode("draw"));
  elements.newDrawing.addEventListener("click", createNewDrawing);
  elements.drawFill.addEventListener("click", () => setDrawTool(FILLED));
  elements.drawErase.addEventListener("click", () => setDrawTool(EMPTY));
  elements.clearDrawing.addEventListener("click", clearDrawing);
  elements.useDrawing.addEventListener("click", () => {
    applyDrawingToClues();
    switchMode("clues");
  });
  elements.builderGrid.addEventListener("pointerdown", beginBuilderPaint);
  elements.builderGrid.addEventListener("pointerover", handleBuilderHover);
  elements.builderGrid.addEventListener("keydown", toggleBuilderCell);
  window.addEventListener("pointerup", () => {
    appState.isDrawing = false;
  });
  elements.solveButton.addEventListener("click", solveFromInputs);
  elements.resetButton.addEventListener("click", resetCurrent);

  createNewDrawing();
  switchMode("draw");
}

initialize();
