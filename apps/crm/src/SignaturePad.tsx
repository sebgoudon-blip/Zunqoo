import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface SignaturePadHandle {
  clear: () => void;
  toDataURL: () => string | null; // null tant que la signature est trop courte
}

/** Zone de signature au doigt, au stylet ou à la souris (écrans haute densité). */
export const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (hasInk: boolean) => void; label: string }>(
  function SignaturePad({ onChange, label }, ref) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const ink = useRef(0);
    const [empty, setEmpty] = useState(true);

    function setup() {
      const c = canvas.current;
      if (!c) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = c.getBoundingClientRect();
      c.width = Math.round(width * ratio);
      c.height = Math.round(height * ratio);
      const ctx = c.getContext("2d")!;
      ctx.scale(ratio, ratio);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = "#1f1a17";
      ink.current = 0;
      setEmpty(true);
      onChange?.(false);
    }

    useEffect(() => {
      setup();
      // Pivot du téléphone : on repart d'une zone vierge plutôt que d'une signature déformée.
      const onResize = () => setup();
      window.addEventListener("orientationchange", onResize);
      return () => window.removeEventListener("orientationchange", onResize);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function point(e: React.PointerEvent) {
      const r = canvas.current!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function down(e: React.PointerEvent<HTMLCanvasElement>) {
      e.preventDefault();
      canvas.current!.setPointerCapture(e.pointerId);
      drawing.current = true;
      last.current = point(e);
    }

    function move(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawing.current || !last.current) return;
      const p = point(e);
      const ctx = canvas.current!.getContext("2d")!;
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ink.current += Math.hypot(p.x - last.current.x, p.y - last.current.y);
      last.current = p;
      if (empty && ink.current > 40) {
        setEmpty(false);
        onChange?.(true);
      }
    }

    function up() {
      drawing.current = false;
      last.current = null;
    }

    useImperativeHandle(ref, () => ({
      clear: setup,
      toDataURL: () => (ink.current > 40 && canvas.current ? canvas.current.toDataURL("image/png") : null),
    }));

    return (
      <div className="sigpad">
        <canvas ref={canvas} role="img" aria-label={label}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
        {empty && <span className="sigpad-hint" aria-hidden="true">Signez ici avec le doigt ou la souris</span>}
        <span className="sigpad-line" aria-hidden="true" />
      </div>
    );
  },
);
