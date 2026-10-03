# Instalación, validación y despliegue

Miga y Cacao es una demo estática de una repostería ficticia, publicada en Vercel: https://miga-y-cacao-demo.vercel.app.

## Instalación local

Requiere Node.js 24; `.nvmrc` y `package.json` indican esa versión. Las dependencias están fijadas en `package-lock.json`.

```sh
npm ci
npm test
npm run build
npm run dev
```

Abrir `http://127.0.0.1:5173`. El servidor usa ese puerto de forma estricta; si está ocupado, detener la instancia anterior antes de iniciarlo. En Windows, Vite puede mantener bloqueados algunos archivos mientras el servidor está abierto: detenerlo antes de volver a ejecutar `npm ci`.

No requiere variables de entorno, credenciales privadas, servicios externos ni una base remota.

Acceso de demostración: `admin@reposteria.example` / `Demo2026!`, o los botones de acceso rápido. Cambiar el rol modifica las acciones disponibles en la interfaz.

## Probar el build

```sh
npm run build
npm run preview -- --port 4173 --strictPort
```

Abrir `http://127.0.0.1:4173/#/compras`. `dist/` contiene únicamente la aplicación estática y sus recursos. [Guía oficial de Vite](https://vite.dev/guide/static-deploy.html).

El puerto 4173 es un origen distinto de 5173: su demo comienza con datos propios. Los registros del navegador no forman parte del build.

## Vercel

`vercel.json` fija Vite, `npm ci`, `npm test && npm run build`, `outputDirectory: dist` y las cabeceras de seguridad (CSP, `nosniff`, `DENY`, `no-referrer` y restricciones de permisos). El sitio publica únicamente el build estático.

Con el proyecto vinculado a Vercel y la CLI autenticada:

```sh
vercel deploy          # vista previa
vercel deploy --prod   # producción
```

## GitHub Pages como alternativa

El workflow `.github/workflows/pages.yml` se ejecuta manualmente (`workflow_dispatch`): instala desde el lockfile, corre las pruebas, genera el build y publica solo `dist/` con las [acciones oficiales de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

1. En el repositorio, abrir Settings → Pages y seleccionar GitHub Actions como fuente.
2. En Actions, elegir «Publicar demo en GitHub Pages» y ejecutar Run workflow sobre la rama predeterminada.
3. Al terminar, revisar desde la URL publicada el acceso, una recepción parcial, la persistencia al recargar, el CSV y la impresión.

Esa publicación tendría una URL distinta de la de Vercel y, por lo tanto, sus propios datos locales.

## Rutas y recursos

`vite.config.ts` usa `base: './'`: los recursos se resuelven respecto del documento, tanto en la raíz como bajo una ruta de repositorio. La navegación usa hash (por ejemplo, `/#/compras`), así que el servidor solo entrega `index.html` y no necesita reescrituras. [Base relativa en Vite](https://vite.dev/guide/build.html#relative-base).

Usar la URL con barra final antes del hash y no abrir `dist/index.html` como archivo local. El dominio y el protocolo forman parte del origen de IndexedDB: una URL nueva crea una demo independiente.

## Repetir las revisiones de navegador

Las herramientas de revisión no son dependencias de la aplicación. Se instalan aparte, por ejemplo en `.qa-tools/`:

```sh
npm install --prefix .qa-tools --ignore-scripts --save-exact playwright@1.62.1 axe-core@4.13.0
```

Variables que usan los recorridos:

- `PLAYWRIGHT_MODULE`: ruta a `.qa-tools/node_modules/playwright/index.mjs`.
- `AXE_SOURCE_PATH`: ruta a `.qa-tools/node_modules/axe-core/axe.min.js`.
- `BROWSER_CHANNEL`: por ejemplo `msedge`; sin ella se usa el Chromium de Playwright.
- `DEMO_URL`: servidor a revisar, por ejemplo `http://127.0.0.1:5173` o la URL pública.
- `SKIP_DOCUMENT_PDF=1`: omite la generación de PDF de control visual.
- `QA_ARTIFACTS`: carpeta de resultados (por defecto `.test-build/`).

Recorridos disponibles:

```sh
node tests/browser-smoke.mjs          # inventario (requiere npm run dev)
node tests/browser-purchases.mjs      # compras (requiere npm run dev)
node tests/browser-accessibility.mjs  # axe y teclado
node tests/browser-release.mjs        # build bajo una ruta de repositorio
node tests/browser-security.mjs       # seguridad sobre el build o DEMO_URL
node tests/browser-public.mjs         # URL pública con perfiles aislados
```

Los recorridos usan contextos de navegador y bases de prueba independientes del visitante. La revisión de accesibilidad aplica reglas WCAG A/AA y buenas prácticas de axe, complementadas con comprobaciones de teclado; no constituye una certificación.

## Límites de la demo

Los registros pertenecen al navegador, perfil y origen. Pueden desaparecer si se limpia el almacenamiento; no hay respaldo remoto ni sincronización entre dispositivos. Los roles son simulados. Todo contacto, compra y movimiento es ficticio: los envíos no se comunican con proveedores y no hay pagos ni documentos fiscales reales.

La aplicación muestra avisos si el almacenamiento falla o el estado es incompatible, y conserva el estado anterior; restablecer exige confirmación. Para imprimir, elegir «Guardar como PDF» en el diálogo del navegador; los CSV se descargan localmente.

Consulta [el alcance, los hallazgos y las limitaciones de la revisión de seguridad](AUDITORIA_SEGURIDAD.md).
