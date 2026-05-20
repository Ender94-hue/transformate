# Imágenes de las cards

Cada producto del dashboard busca su imagen en `img/{id}.jpg`.
Si el archivo no existe, la card muestra el fallback (emoji + título).

## Formato recomendado

- **Proporción:** 3:4 vertical (las cards usan `aspect-ratio: 3/4`)
- **Tamaño:** 600×800 px o 750×1000 px (suficiente nitidez sin pesar demasiado)
- **Formato:** JPG (ahorra peso). PNG si necesitas transparencia.
- **Peso ideal:** < 150 KB por imagen (usa una compresora como TinyPNG si hace falta)

## Lista de archivos a crear

### Meditaciones (Reconfigurando nuestros pensamientos)
- `med-001.jpg` — Replanteando nuestra manera de pensar
- `med-002.jpg` — Cambiando creencias limitantes
- `med-003.jpg` — Reestructurando nuestras ideas
- `med-004.jpg` — Renovando nuestra visión del mundo
- `med-005.jpg` — Fortaleciendo la autoestima y la confianza
- `med-006.jpg` — Cultivando una vida más consciente y equilibrada

### Sonidos (Desafío: Materializando lo que queremos)
- `son-001.jpg` — Realmente, ¿qué queremos?
- `son-002.jpg` — Cuadro de los sueños
- `son-003.jpg` — Cambio de look
- `son-004.jpg` — La importancia del no
- `son-005.jpg` — No dudamos
- `son-006.jpg` — Compromiso por encima de todo

### Rituales
- `rit-001.jpg` — Limpieza del Cuerpo
- `rit-002.jpg` — Limpieza de la Casa
- `rit-003.jpg` — Protección Espiritual
- `rit-004.jpg` — Ritual de Abundancia y Dinero
- `rit-005.jpg` — Principio del Alquimista

### Mantras
- `man-001.jpg` — Mantra OM Universal
- `man-002.jpg` — Gayatri Mantra

### Oráculo
- `ora-001.jpg` — Tirada del Día
- `ora-002.jpg` — Tarot del Amor

### Respiración
- `res-001.jpg` — Respiración 4-7-8
- `res-002.jpg` — Pranayama Avanzado

## Tip

La imagen es **solo visual** (escena, branding "Flow" si quieres, iconos decorativos).
**NO pongas el título dentro de la imagen** — el título lo añade la card por debajo, en blanco bold cursiva mayúsculas con barra dorada.

Esto te permite reutilizar la misma imagen y solo cambiar el título desde la BD si hace falta.
