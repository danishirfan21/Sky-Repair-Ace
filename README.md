# Sky Repair Ace

A high-octane Three.js flight combat and repair game.

## Features
- **Dynamic Flight Combat**: Maneuver your plane with WASD.
- **Repair Mechanics**: Hold 'R' when damaged to fill the repair ring.
- **Near Miss System**: Fly close to bullets for bonus points and slow-motion.
- **Weapon Tiers**: Get perfect repair chains to unlock powerful weapons.

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (includes npm)

### Running the Project
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open your browser to the URL shown in the terminal (usually `http://localhost:5173`).

### Controls
- **WASD**: Move
- **Space**: Fire
- **R**: Hold to repair
- **Shift**: Boost

## Performance note

Sky Repair Ace uses Three.js/WebGL, so performance depends heavily on your browser’s active GPU.

On laptops with both Intel integrated graphics and NVIDIA/AMD dedicated graphics, Chrome may use the integrated GPU by default.

For best performance on Windows:

1. Open Windows Settings
2. Go to System → Display → Graphics
3. Add Google Chrome:
   `C:\Program Files\Google\Chrome\Application\chrome.exe`
4. Set it to High performance
5. Restart Chrome
6. Open `chrome://gpu`
7. Check `GL_RENDERER`

Recommended:
`GL_RENDERER` should mention your NVIDIA/AMD GPU.

Slower:
`GL_RENDERER` mentions Intel integrated graphics.

Bad:
`GL_RENDERER` mentions SwiftShader or software rendering.