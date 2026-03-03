/** Generate a procedural background canvas for demo purposes. */
export function generateProceduralBg(
  width: number,
  height: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;

  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#f5f3f7");
  grad.addColorStop(0.3, "#ece4f6");
  grad.addColorStop(0.6, "#f6e2dc");
  grad.addColorStop(1, "#e8d5e0");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Dense content lines for visible distortion
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `hsl(${250 + i * 8}, 55%, ${45 + (i % 4) * 12}%)`;
    const x = (i * 137) % width;
    const y = (i * 73) % height;
    ctx.fillRect(x, y, 180 + (i % 5) * 100, 6 + (i % 3) * 5);
  }
  ctx.globalAlpha = 1;

  // Simulated "cards"
  const cards = [
    { x: 40, y: 60, w: 540, h: 300, color: "#4f3adb" },
    { x: 40, y: 400, w: 540, h: 300, color: "#7b6be6" },
    { x: 640, y: 60, w: 540, h: 300, color: "#d9d5de" },
    { x: 640, y: 400, w: 540, h: 300, color: "#4f3adb" },
    { x: 340, y: 740, w: 540, h: 260, color: "#b8a5e0" },
  ];
  for (const card of cards) {
    ctx.fillStyle = card.color;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.roundRect(card.x, card.y, card.w, card.h, 16);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#1a1a1a";
    ctx.globalAlpha = 0.65;
    for (let line = 0; line < 6; line++) {
      const lw = 80 + Math.random() * 350;
      ctx.fillRect(card.x + 24, card.y + 36 + line * 26, lw, 10);
    }
    ctx.globalAlpha = 1;
  }

  // Heading text
  ctx.font = "bold 80px system-ui";
  ctx.fillStyle = "#1a1a1a";
  ctx.globalAlpha = 0.85;
  ctx.fillText("Glass Distortion", 50, height - 140);
  ctx.font = "italic 38px Georgia";
  ctx.fillStyle = "#4f3adb";
  ctx.fillText("Move your mouse to see the effect", 50, height - 80);
  ctx.globalAlpha = 1;

  // Fine grid
  ctx.strokeStyle = "rgba(79, 58, 219, 0.1)";
  ctx.lineWidth = 1;
  for (let gx = 0; gx < width; gx += 36) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height);
    ctx.stroke();
  }
  for (let gy = 0; gy < height; gy += 36) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
    ctx.stroke();
  }

  return c;
}
