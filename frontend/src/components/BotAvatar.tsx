import { memo, useEffect, useId, useRef, useState } from "react";
import { NOTIF_BLUE } from "../lib/bot/decor";
import { BotEngine, type BotFrame } from "../lib/bot/engine";
import { EXPRESSION_BY_ID, type ExpressionId } from "../lib/bot/expressions";
import { DEMI_VIEWBOX, RAYON } from "../lib/bot/repere";
import {
  COLOR_BY_ID,
  mixHex,
  SHAPE_BY_ID,
  type ColorId,
  type ShapeId,
} from "../lib/bot/skins";
import { type StateId } from "../lib/bot/states";

/** La mascotte de Paper : forme "page" (coin corne) + bleu accent de l'app. */
const PAPER_SHAPE: ShapeId = "page";
const PAPER_COLOR: ColorId = "papier";
const PAPER_EXPRESSION: ExpressionId = "attentif";

type BotAvatarProps = {
  /** Etat anime (ex. "thinking" pendant qu'une reponse se prepare), pilote en direct, sans duree a prevoir. */
  state?: StateId;
  shape?: ShapeId;
  color?: ColorId;
  expression?: ExpressionId;
  size?: number;
  /** Couleur de fond, utilisee derriere les yeux (trous dans le corps) et pour la brume de profondeur des particules. */
  paper?: string;
  theme?: "light" | "dark";
  animated?: boolean;
  decorative?: boolean;
};

function renderDot(
  dot: BotFrame["dots"][number],
  key: string,
  paper: string,
  ink: string,
) {
  const fill =
    dot.color ??
    (dot.depth === undefined ? ink : mixHex(paper, ink, dot.depth));
  if (dot.d) {
    return (
      <path
        key={key}
        d={dot.d}
        transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${RAYON})`}
        fill={fill}
        opacity={dot.opacity}
      />
    );
  }
  return (
    <circle
      key={key}
      cx={dot.x}
      cy={dot.y}
      r={dot.r}
      fill={fill}
      opacity={dot.opacity}
    />
  );
}

export const BotAvatar = memo(function BotAvatar({
  state = "idle",
  shape = PAPER_SHAPE,
  color = PAPER_COLOR,
  expression = PAPER_EXPRESSION,
  size = 96,
  paper: background,
  theme = "light",
  animated = true,
  decorative = true,
}: BotAvatarProps) {
  const paper = background ?? (theme === "dark" ? "#212326" : "#ffffff");
  const svgRef = useRef<SVGSVGElement>(null);
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const [reduced, setReduced] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  const uid = useId();
  const maskId = `bot-mask-${uid}`;
  const ink = COLOR_BY_ID.get(color)?.hex ?? "#0a0a0c";

  const engineRef = useRef<BotEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new BotEngine(
      RAYON,
      state,
      SHAPE_BY_ID.get(shape)?.radii ?? null,
      (expression && EXPRESSION_BY_ID.get(expression)) ?? null,
    );
  }
  const engine = engineRef.current;

  const [frame, setFrame] = useState<BotFrame>(() => engine.sample(0));
  const clockRef = useRef(0);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media?.matches ?? false);
    const visibility = () => setPageVisible(!document.hidden);
    media?.addEventListener("change", change);
    document.addEventListener("visibilitychange", visibility);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) =>
            setVisible(entry.isIntersecting),
          );
    if (svgRef.current) observer?.observe(svgRef.current);
    return () => {
      media?.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", visibility);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    engine.setState(state, clockRef.current);
  }, [engine, state]);

  useEffect(() => {
    engine.setShape(SHAPE_BY_ID.get(shape)?.radii ?? null, clockRef.current);
  }, [engine, shape]);

  useEffect(() => {
    engine.setExpression(
      (expression && EXPRESSION_BY_ID.get(expression)) ?? null,
      clockRef.current,
    );
  }, [engine, expression]);

  useEffect(() => {
    if (!animated || reduced) {
      clockRef.current += 3;
      setFrame(engine.sample(clockRef.current));
      return;
    }
    if (!visible || !pageVisible) return;
    let raf = 0;
    let last = 0;
    const tick = (ms: number) => {
      if (last && ms - last < 32) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0;
      last = ms;
      clockRef.current += dt;
      setFrame(engine.sample(clockRef.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, shape, expression, animated, reduced, visible, pageVisible]);

  const vb = DEMI_VIEWBOX;

  return (
    <svg
      ref={svgRef}
      aria-hidden={decorative || undefined}
      width={size}
      height={size}
      viewBox={`${-vb} ${-vb} ${vb * 2} ${vb * 2}`}
      role="img"
      aria-label="Paper assistant avatar"
    >
      <defs>
        {/* Les yeux sont de vrais trous dans le corps, pas des formes blanches posees dessus. */}
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={-vb}
          y={-vb}
          width={vb * 2}
          height={vb * 2}
        >
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            <path
              key={i}
              d={eye.d}
              transform={eye.matrix}
              opacity={eye.alpha}
              fill="#000"
            />
          ))}
          {frame.notch ? (
            <circle
              cx={frame.notch.x}
              cy={frame.notch.y}
              r={frame.notch.r}
              fill="#000"
            />
          ) : null}
        </mask>
        {frame.arcs.map((arc) => (
          <linearGradient
            key={arc.id}
            id={`${uid}-${arc.id}`}
            gradientUnits="userSpaceOnUse"
            x1={arc.grad.x1}
            y1={arc.grad.y1}
            x2={arc.grad.x2}
            y2={arc.grad.y2}
          >
            {arc.grad.stops.map((stopColor, i) => (
              <stop
                key={i}
                offset={i / (arc.grad.stops.length - 1)}
                stopColor={stopColor}
              />
            ))}
          </linearGradient>
        ))}
      </defs>

      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`b${arc.id}`}
            d={arc.back}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>

      {frame.dotsBehind ? (
        <g>
          {frame.dots.map((dot, i) => renderDot(dot, `pb${i}`, paper, ink))}
        </g>
      ) : null}

      <g opacity={frame.bodyAlpha}>
        <path d={frame.bodyPath} fill={paper} />
        <g mask={`url(#${maskId})`}>
          <rect x={-vb} y={-vb} width={vb * 2} height={vb * 2} fill={ink} />
        </g>
      </g>

      {!frame.dotsBehind ? (
        <g>
          {frame.dots.map((dot, i) => renderDot(dot, `pf${i}`, paper, ink))}
        </g>
      ) : null}

      {frame.notif ? (
        <circle
          cx={frame.notif.x}
          cy={frame.notif.y}
          r={frame.notif.r}
          fill={NOTIF_BLUE}
        />
      ) : null}

      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`f${arc.id}`}
            d={arc.front}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>
    </svg>
  );
});
