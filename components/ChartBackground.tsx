// Fondo decorativo tipo "gráfico de velas", generado con matemáticas
// deterministas (sin Math.random) para que el render en servidor y en
// cliente coincida siempre. No es una foto — es una ilustración propia
// que evita depender de bancos de imágenes externos.
const CANDLE_COUNT = 46;

const CANDLES = Array.from({ length: CANDLE_COUNT }, (_, i) => {
  const trend = Math.sin(i * 0.35) * 22 + Math.sin(i * 1.1 + 2) * 10;
  const body = 10 + ((i * 37) % 22);
  const wick = body + 8 + ((i * 17) % 14);
  const up = (i * 7) % 3 !== 0;
  return { trend, body, wick, up };
});

export function ChartBackground() {
  const width = 1000;
  const height = 260;
  const gap = width / CANDLE_COUNT;
  const baseline = 210;

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-[#07070a]">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(212,175,55,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(212,175,55,0.12) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-2/3 w-full"
      >
        {CANDLES.map((candle, i) => {
          const x = i * gap + gap * 0.25;
          const candleWidth = gap * 0.5;
          const top = baseline - candle.body - candle.trend;
          const wickTop = baseline - candle.wick - candle.trend;
          const color = candle.up ? "#d4af37" : "#8a8070";
          return (
            <g key={i} opacity={0.5}>
              <line
                x1={x + candleWidth / 2}
                x2={x + candleWidth / 2}
                y1={wickTop}
                y2={baseline - candle.trend}
                stroke={color}
                strokeWidth={1.5}
              />
              <rect x={x} y={top} width={candleWidth} height={candle.body} fill={color} />
            </g>
          );
        })}
      </svg>

      <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/55 to-black/20" />
      <div className="absolute inset-0 bg-linear-to-r from-black/75 via-black/15 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-b from-transparent to-background" />
    </div>
  );
}
