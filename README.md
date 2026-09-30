# 👻 Irregular Verbs PAC-MAN

![JavaScript Vanilla](https://img.shields.io/badge/JavaScript-Vanilla-f7df1e?logo=javascript&logoColor=black)
![Sin frameworks](https://img.shields.io/badge/frameworks-ninguno-blue)
![Sin build](https://img.shields.io/badge/build-no%20requerido-success)
![Licencia](https://img.shields.io/badge/licencia-MIT-green)
![Licencia: MIT](https://shields.io)


Juego educativo para aprender los **112 verbos irregulares** más comunes del
inglés, con la mecánica clásica de Pac-Man: comes la forma correcta del
verbo mientras esquivas a los fantasmas. Hecho **100% en HTML, CSS y
JavaScript puro** — sin frameworks, sin dependencias, sin paso de build.

## ✨ Características

- 🎮 **Modos de juego:** Past Simple, Past Participle, Mixto y
  ⏱ Contrarreloj (60 s).
- 👹 **Jefe final:** aparece tras superar una racha de aciertos.
- ⭐💎❤️ **Power-ups:** estrella (congela fantasmas), diamante (puntos x2)
  y corazón (vida extra o segundos extra en Contrarreloj).
- 🧠 **Memoria inteligente:** el juego recuerda los verbos que fallaste y
  te los vuelve a preguntar con más frecuencia.
- 📖 **Modo estudio:** diccionario buscable de los 112 verbos, con
  pronunciación por voz.
- 🎵 **Música chiptune:** generada por código con la Web Audio API, sin
  archivos de audio externos.
- 📊 **Estadísticas persistentes:** récord, partidas jugadas y verbos
  dominados, guardados en `localStorage`.
- 📤 **Exportación CSV:** descarga tu progreso o la lista de errores para
  repasar fuera del juego.

## ▶️ Cómo ejecutarlo

No necesita instalación ni servidor obligatorio: basta con abrir el
archivo en el navegador.

```bash
# Opción 1: abrir directamente
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows

# Opción 2: servidor local (recomendado para evitar restricciones
# de seguridad del navegador con archivos locales)
python3 -m http.server 8000
# luego abre http://localhost:8000 en tu navegador
```

## ⌨️ Controles

| Acción | Teclado | Táctil |
|---|---|---|
| Moverse | Flechas / W A S D | Deslizar el dedo |
| Pausar | `P` / `Esc` | Botón ⏸ en pantalla |
| Confirmar en menús | `Enter` / clic | Toque |
| Silenciar sonido | Botón 🔊 | Botón 🔊 |

## 🎯 Mecánicas

| Evento | Efecto |
|---|---|
| ✅ Comer la forma correcta | Suma puntos (bonus por racha y velocidad) |
| ❌ Comer una forma incorrecta | Pierdes una vida y se reinicia la racha |
| 👻 Fantasma normal te toca | Pierdes una vida |
| ⭐ Comer la estrella | Congela a los fantasmas unos segundos |
| ❄️ Tocar un fantasma congelado | Lo "comes": puntos extra, sin penalización |
| 💎 Comer el diamante | Duplica los puntos de la siguiente respuesta |
| ❤️ Comer el corazón | Vida extra (o segundos extra en Contrarreloj) |
| 👹 Vencer al jefe final | Bonus grande de puntos y mención especial |
| 🏁 Fin de la partida | Nota sobre 10, letra (S/A/B/C/D) y tabla de repaso |

## 📁 Estructura de archivos

```
.
├── index.html   # Estructura: menú, HUD, canvas y overlays
├── style.css    # Colores, temas claro/oscuro y animaciones
├── verbs.js     # SOLO datos: los 112 verbos irregulares
├── game.js      # Lógica del juego, laberinto, IA y dibujo
├── README.md
├── LICENSE
└── .gitignore
```

## ➕ Cómo añadir un verbo nuevo

Todos los verbos viven en `verbs.js`, dentro de `VERB_DATA`. Cada línea
tiene el formato:

```js
["infinitivo", "pasado", "participio", "español", "nivel"]
```

Donde `nivel` es `"A"` (fácil), `"B"` (medio) o `"C"` (difícil). Agrega tu
línea dentro del bloque del nivel que corresponda y el verbo aparecerá
automáticamente en el juego — no hace falta tocar `game.js`.

## 📜 Licencia

Este proyecto está bajo la licencia MIT. Consulta el archivo
[LICENSE](./LICENSE) para más detalles.