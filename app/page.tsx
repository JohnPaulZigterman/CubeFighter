"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Direction = 0 | 1 | 2 | 3;
type Phase = "playing" | "cleared" | "dead";
type Point = { x: number; y: number };
type Triangle = Point & { id: number; direction: Direction };

type GameState = {
  level: number;
  size: number;
  runSeed: number;
  player: Point;
  walls: Set<string>;
  innerWalls: Set<string>;
  triangles: Triangle[];
  phase: Phase;
  turn: number;
  destroyed: number;
  message: string;
};

const DIRECTIONS: ReadonlyArray<Point & { name: string; glyph: string }> = [
  { x: 0, y: -1, name: "up", glyph: "↑" },
  { x: 1, y: 0, name: "right", glyph: "→" },
  { x: 0, y: 1, name: "down", glyph: "↓" },
  { x: -1, y: 0, name: "left", glyph: "←" },
];

const INITIAL_SEED = 0x0c0bef17;
const keyOf = (x: number, y: number) => `${x},${y}`;
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function remainsConnected(size: number, walls: Set<string>, start: Point) {
  const queue = [start];
  const visited = new Set([keyOf(start.x, start.y)]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const direction of DIRECTIONS) {
      const next = {
        x: current.x + direction.x,
        y: current.y + direction.y,
      };
      const nextKey = keyOf(next.x, next.y);
      if (
        next.x <= 0 ||
        next.y <= 0 ||
        next.x >= size - 1 ||
        next.y >= size - 1 ||
        walls.has(nextKey) ||
        visited.has(nextKey)
      ) {
        continue;
      }
      visited.add(nextKey);
      queue.push(next);
    }
  }

  return visited.size === (size - 2) ** 2 - walls.size;
}

function createLevel(level: number, runSeed: number): GameState {
  const size = 10 + Math.floor((level - 1) / 3);
  const triangleCount = level + 1;
  const wallCount = level + 2;
  const random = seededRandom(runSeed + level * 7919);
  const player = {
    x: Math.floor(size / 2),
    y: Math.floor(size / 2),
  };

  const walls = new Set<string>();
  for (let index = 0; index < size; index += 1) {
    walls.add(keyOf(index, 0));
    walls.add(keyOf(index, size - 1));
    walls.add(keyOf(0, index));
    walls.add(keyOf(size - 1, index));
  }

  const openCells: Point[] = [];
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      if (x !== player.x || y !== player.y) openCells.push({ x, y });
    }
  }

  const safeFromSpawn = (cell: Point) =>
    Math.abs(cell.x - player.x) + Math.abs(cell.y - player.y) > 2;
  const coreCells = openCells.filter(
    (cell) =>
      safeFromSpawn(cell) &&
      cell.x > 1 &&
      cell.y > 1 &&
      cell.x < size - 2 &&
      cell.y < size - 2,
  );
  const edgeCells = openCells.filter(
    (cell) => safeFromSpawn(cell) && !coreCells.includes(cell),
  );
  const wallCandidates = [
    ...shuffled(coreCells, random),
    ...shuffled(edgeCells, random),
  ];
  const innerWalls = new Set<string>();

  for (const cell of wallCandidates) {
    if (innerWalls.size >= wallCount) break;
    const candidateKey = keyOf(cell.x, cell.y);
    const trial = new Set(innerWalls);
    trial.add(candidateKey);
    if (remainsConnected(size, trial, player)) {
      innerWalls.add(candidateKey);
      walls.add(candidateKey);
    }
  }

  const triangleCells = shuffled(
    openCells.filter(
      (cell) =>
        !walls.has(keyOf(cell.x, cell.y)) &&
        Math.abs(cell.x - player.x) + Math.abs(cell.y - player.y) > 2,
    ),
    random,
  ).slice(0, triangleCount);

  const triangles = triangleCells.map((cell, index) => ({
    ...cell,
    id: index,
    direction: Math.floor(random() * 4) as Direction,
  }));

  return {
    level,
    size,
    runSeed,
    player,
    walls,
    innerWalls,
    triangles,
    phase: "playing",
    turn: 0,
    destroyed: 0,
    message: "Your move. Read the shape before you step.",
  };
}

function contactFace(triangle: Triangle, move: Point) {
  const tip = DIRECTIONS[triangle.direction];
  if (move.x === tip.x && move.y === tip.y) return "base";
  if (move.x === -tip.x && move.y === -tip.y) return "tip";
  return "side";
}

function enemyTurn(game: GameState): GameState {
  if (game.phase !== "playing") return game;

  const occupied = new Set(
    game.triangles.map((triangle) => keyOf(triangle.x, triangle.y)),
  );
  const proposals = game.triangles.map((triangle) => {
    const move = DIRECTIONS[triangle.direction];
    const target = { x: triangle.x + move.x, y: triangle.y + move.y };
    const targetKey = keyOf(target.x, target.y);
    return {
      triangle,
      target,
      targetKey,
      blocked: game.walls.has(targetKey) || occupied.has(targetKey),
    };
  });

  if (
    proposals.some(
      (proposal) =>
        !proposal.blocked && samePoint(proposal.target, game.player),
    )
  ) {
    return {
      ...game,
      phase: "dead",
      message: "Point contact. The cube was pierced.",
    };
  }

  const targetCounts = new Map<string, number>();
  for (const proposal of proposals) {
    if (!proposal.blocked) {
      targetCounts.set(
        proposal.targetKey,
        (targetCounts.get(proposal.targetKey) ?? 0) + 1,
      );
    }
  }

  let rotations = 0;
  const triangles = proposals.map(({ triangle, target, targetKey, blocked }) => {
    if (blocked || (targetCounts.get(targetKey) ?? 0) > 1) {
      rotations += 1;
      return {
        ...triangle,
        direction: ((triangle.direction + 1) % 4) as Direction,
      };
    }
    return { ...triangle, ...target };
  });

  return {
    ...game,
    triangles,
    turn: game.turn + 1,
    message:
      rotations > 0
        ? `${rotations} triangle${rotations === 1 ? "" : "s"} turned clockwise.`
        : "Triangles advanced. Your move.",
  };
}

function triangleAt(game: GameState, x: number, y: number) {
  return game.triangles.find(
    (triangle) => triangle.x === x && triangle.y === y,
  );
}

function outcomeForMove(game: GameState, direction: Direction) {
  const move = DIRECTIONS[direction];
  const target = {
    x: game.player.x + move.x,
    y: game.player.y + move.y,
  };
  const targetKey = keyOf(target.x, target.y);

  if (game.walls.has(targetKey)) {
    return { targetKey, tone: "blocked", label: "WALL · choose another route" };
  }

  const triangle = triangleAt(game, target.x, target.y);
  if (!triangle) return { targetKey, tone: "move", label: "OPEN · move" };

  const face = contactFace(triangle, move);
  if (face === "base") {
    return { targetKey, tone: "safe", label: "BASE · triangle breaks" };
  }
  if (face === "tip") {
    return { targetKey, tone: "danger", label: "POINT · cube breaks" };
  }
  return { targetKey, tone: "neutral", label: "SIDE · no damage" };
}

export default function CubeFighter() {
  const [game, setGame] = useState(() => createLevel(1, INITIAL_SEED));
  const [busy, setBusy] = useState(false);
  const [previewDirection, setPreviewDirection] = useState<Direction | null>(
    null,
  );

  const preview = useMemo(
    () =>
      previewDirection === null
        ? null
        : outcomeForMove(game, previewDirection),
    [game, previewDirection],
  );

  const act = useCallback(
    (direction: Direction | "wait") => {
      if (busy || game.phase !== "playing") return;
      setPreviewDirection(null);

      if (direction === "wait") {
        setBusy(true);
        setGame((current) => ({
          ...current,
          message: "You waited. Triangles are moving…",
        }));
        window.setTimeout(() => {
          setGame((current) => enemyTurn(current));
          setBusy(false);
        }, 190);
        return;
      }

      const move = DIRECTIONS[direction];
      const target = {
        x: game.player.x + move.x,
        y: game.player.y + move.y,
      };
      const targetKey = keyOf(target.x, target.y);

      if (game.walls.has(targetKey)) {
        setGame((current) => ({
          ...current,
          message: "Wall. No turn spent.",
        }));
        return;
      }

      const triangle = triangleAt(game, target.x, target.y);
      if (triangle) {
        const face = contactFace(triangle, move);
        if (face === "tip") {
          setGame((current) => ({
            ...current,
            phase: "dead",
            message: "Point contact. The cube was pierced.",
          }));
          return;
        }

        if (face === "side") {
          setBusy(true);
          setGame((current) => ({
            ...current,
            message: "Side contact. No damage — but the turn is spent.",
          }));
          window.setTimeout(() => {
            setGame((current) => enemyTurn(current));
            setBusy(false);
          }, 190);
          return;
        }

        const survivors = game.triangles.filter(
          (candidate) => candidate.id !== triangle.id,
        );
        if (survivors.length === 0) {
          setGame((current) => ({
            ...current,
            player: target,
            triangles: survivors,
            destroyed: current.destroyed + 1,
            phase: "cleared",
            message: "Grid clear. Geometry resolved.",
          }));
          return;
        }

        setBusy(true);
        setGame((current) => ({
          ...current,
          player: target,
          triangles: survivors,
          destroyed: current.destroyed + 1,
          message: "Base contact. Triangle destroyed.",
        }));
      } else {
        setBusy(true);
        setGame((current) => ({
          ...current,
          player: target,
          message: "Cube moved. Triangles are moving…",
        }));
      }

      window.setTimeout(() => {
        setGame((current) => enemyTurn(current));
        setBusy(false);
      }, 190);
    },
    [busy, game],
  );

  const retryLevel = useCallback(() => {
    setBusy(false);
    setPreviewDirection(null);
    setGame((current) => createLevel(current.level, current.runSeed));
  }, []);

  const newRun = useCallback(() => {
    setBusy(false);
    setPreviewDirection(null);
    setGame(createLevel(1, Math.floor(Math.random() * 0x7fffffff)));
  }, []);

  const nextLevel = useCallback(() => {
    setBusy(false);
    setPreviewDirection(null);
    setGame((current) => createLevel(current.level + 1, current.runSeed));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r") {
        retryLevel();
        return;
      }
      const directionByKey: Record<string, Direction> = {
        ArrowUp: 0,
        w: 0,
        ArrowRight: 1,
        d: 1,
        ArrowDown: 2,
        s: 2,
        ArrowLeft: 3,
        a: 3,
      };
      const direction = directionByKey[event.key];
      if (direction !== undefined) {
        event.preventDefault();
        act(direction);
      } else if (event.code === "Space") {
        event.preventDefault();
        act("wait");
      } else if (event.key === "Enter" && game.phase === "cleared") {
        nextLevel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [act, game.phase, nextLevel, retryLevel]);

  const growthIn = 3 - ((game.level - 1) % 3);
  const gridStyle = {
    "--grid-size": game.size,
  } as CSSProperties;
  const cells = [];

  for (let y = 0; y < game.size; y += 1) {
    for (let x = 0; x < game.size; x += 1) {
      const cellKey = keyOf(x, y);
      const isWall = game.walls.has(cellKey);
      const isInnerWall = game.innerWalls.has(cellKey);
      const isPlayer = game.player.x === x && game.player.y === y;
      const triangle = triangleAt(game, x, y);
      const isAdjacent =
        Math.abs(game.player.x - x) + Math.abs(game.player.y - y) === 1;
      const direction = DIRECTIONS.findIndex(
        (move) =>
          game.player.x + move.x === x && game.player.y + move.y === y,
      ) as Direction;
      const previewTone =
        preview?.targetKey === cellKey ? ` preview-${preview.tone}` : "";

      cells.push(
        <button
          className={`cell${isWall ? " wall-cell" : ""}${isInnerWall ? " inner-wall-cell" : ""}${previewTone}`}
          key={cellKey}
          type="button"
          tabIndex={-1}
          aria-label={
            isWall
              ? `Wall at column ${x + 1}, row ${y + 1}`
              : triangle
                ? `Triangle facing ${DIRECTIONS[triangle.direction].name} at column ${x + 1}, row ${y + 1}`
                : isPlayer
                  ? `Cube at column ${x + 1}, row ${y + 1}`
                  : `Empty cell at column ${x + 1}, row ${y + 1}`
          }
          onClick={() => {
            if (isAdjacent && direction >= 0) act(direction);
          }}
          onMouseEnter={() => {
            if (isAdjacent && direction >= 0) setPreviewDirection(direction);
          }}
          onMouseLeave={() => setPreviewDirection(null)}
          onFocus={() => {
            if (isAdjacent && direction >= 0) setPreviewDirection(direction);
          }}
          onBlur={() => setPreviewDirection(null)}
        >
          {isWall && <span className="wall-block" />}
          {isPlayer && (
            <span className="cube-token" aria-hidden="true">
              <span />
            </span>
          )}
          {triangle && (
            <span
              className="enemy-token"
              style={
                {
                  "--triangle-turn": `${triangle.direction * 90}deg`,
                } as CSSProperties
              }
              aria-hidden="true"
            >
              <span className="intent-line" />
              <span className="triangle-shell" />
              <span className="triangle-tip" />
              <span className="triangle-base" />
            </span>
          )}
        </button>,
      );
    }
  }

  return (
    <main className={`game-shell phase-${game.phase}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ◇
          </span>
          <div>
            <h1>CUBE//FIGHTER</h1>
            <p>TURN-BASED GEOMETRY</p>
          </div>
        </div>
        <button className="text-button" type="button" onClick={newRun}>
          NEW RUN
        </button>
      </header>

      <section className="game-layout">
        <aside className="intel-panel level-panel" aria-label="Level status">
          <p className="eyebrow">SECTOR</p>
          <div className="level-number">{String(game.level).padStart(2, "0")}</div>
          <div className="metric-grid">
            <div>
              <span>GRID</span>
              <strong>
                {game.size}×{game.size}
              </strong>
            </div>
            <div>
              <span>HOSTILES</span>
              <strong>{String(game.triangles.length).padStart(2, "0")}</strong>
            </div>
            <div>
              <span>BLOCKS</span>
              <strong>{String(game.innerWalls.size).padStart(2, "0")}</strong>
            </div>
            <div>
              <span>TURNS</span>
              <strong>{String(game.turn).padStart(2, "0")}</strong>
            </div>
          </div>
          <div className="growth-meter">
            <div className="growth-label">
              <span>NEXT GRID GROWTH</span>
              <strong>
                {growthIn} CLEAR{growthIn === 1 ? "" : "S"}
              </strong>
            </div>
            <div className="growth-pips" aria-hidden="true">
              {[0, 1, 2].map((pip) => (
                <span
                  className={pip < 3 - growthIn ? "filled" : ""}
                  key={pip}
                />
              ))}
            </div>
          </div>
        </aside>

        <section className="board-column" aria-label="Game board">
          <div className="board-frame">
            <div
              className="game-board"
              style={gridStyle}
              role="grid"
              aria-label={`${game.size} by ${game.size} Cube Fighter grid`}
            >
              {cells}
            </div>

            {game.phase !== "playing" && (
              <div className={`result-overlay ${game.phase}`} role="dialog">
                <p className="eyebrow">
                  {game.phase === "cleared" ? "SECTOR COMPLETE" : "SIGNAL LOST"}
                </p>
                <h2>
                  {game.phase === "cleared" ? "GRID CLEAR" : "CUBE BROKEN"}
                </h2>
                <p>
                  {game.phase === "cleared"
                    ? `${game.destroyed} triangle${game.destroyed === 1 ? "" : "s"} resolved in ${game.turn} turn${game.turn === 1 ? "" : "s"}.`
                    : "The point wins. Re-read the facing and try the same layout again."}
                </p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={game.phase === "cleared" ? nextLevel : retryLevel}
                >
                  {game.phase === "cleared" ? "ENTER NEXT SECTOR" : "RETRY SECTOR"}
                </button>
              </div>
            )}
          </div>

          <div
            className={`status-strip ${preview ? `previewing ${preview.tone}` : ""}`}
            aria-live="polite"
          >
            <span className="status-light" />
            <p>{preview?.label ?? game.message}</p>
          </div>
        </section>

        <aside className="intel-panel rules-panel" aria-label="Rules and controls">
          <p className="eyebrow">READ THE SHAPE</p>
          <div className="rule-list">
            <div className="rule-row safe-rule">
              <span className="rule-symbol">▬</span>
              <div>
                <strong>FLAT BASE</strong>
                <p>Triangle breaks</p>
              </div>
            </div>
            <div className="rule-row danger-rule">
              <span className="rule-symbol">▲</span>
              <div>
                <strong>POINT</strong>
                <p>Cube breaks</p>
              </div>
            </div>
            <div className="rule-row neutral-rule">
              <span className="rule-symbol">╱</span>
              <div>
                <strong>SIDE</strong>
                <p>No damage</p>
              </div>
            </div>
          </div>

          <div className="enemy-rule">
            <span className="clockwise-icon" aria-hidden="true">
              ↻
            </span>
            <p>
              Triangles move point-first. If blocked, they turn clockwise.
            </p>
          </div>

          <div className="controls" aria-label="Movement controls">
            <p className="eyebrow">MOVE / PREVIEW</p>
            <div className="dpad">
              <button
                className="dpad-up"
                type="button"
                aria-label="Move up"
                disabled={busy || game.phase !== "playing"}
                onClick={() => act(0)}
                onMouseEnter={() => setPreviewDirection(0)}
                onMouseLeave={() => setPreviewDirection(null)}
                onFocus={() => setPreviewDirection(0)}
                onBlur={() => setPreviewDirection(null)}
              >
                ↑
              </button>
              <button
                className="dpad-left"
                type="button"
                aria-label="Move left"
                disabled={busy || game.phase !== "playing"}
                onClick={() => act(3)}
                onMouseEnter={() => setPreviewDirection(3)}
                onMouseLeave={() => setPreviewDirection(null)}
                onFocus={() => setPreviewDirection(3)}
                onBlur={() => setPreviewDirection(null)}
              >
                ←
              </button>
              <button
                className="dpad-wait"
                type="button"
                aria-label="Wait one turn"
                disabled={busy || game.phase !== "playing"}
                onClick={() => act("wait")}
              >
                WAIT
              </button>
              <button
                className="dpad-right"
                type="button"
                aria-label="Move right"
                disabled={busy || game.phase !== "playing"}
                onClick={() => act(1)}
                onMouseEnter={() => setPreviewDirection(1)}
                onMouseLeave={() => setPreviewDirection(null)}
                onFocus={() => setPreviewDirection(1)}
                onBlur={() => setPreviewDirection(null)}
              >
                →
              </button>
              <button
                className="dpad-down"
                type="button"
                aria-label="Move down"
                disabled={busy || game.phase !== "playing"}
                onClick={() => act(2)}
                onMouseEnter={() => setPreviewDirection(2)}
                onMouseLeave={() => setPreviewDirection(null)}
                onFocus={() => setPreviewDirection(2)}
                onBlur={() => setPreviewDirection(null)}
              >
                ↓
              </button>
            </div>
            <p className="key-hint">ARROWS / WASD · SPACE TO WAIT · R TO RETRY</p>
          </div>
        </aside>
      </section>

      <footer>
        <span>ONE MOVE. THEN THEY MOVE.</span>
        <span>ALL OUTCOMES ARE VISIBLE.</span>
      </footer>
    </main>
  );
}
