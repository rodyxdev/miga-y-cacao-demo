# Revisión de seguridad de Miga y Cacao

Realizada el 3 de octubre de 2026, hora de México. Versión revisada y corregida: **0.5.1**, publicada en [producción](https://miga-y-cacao-demo.vercel.app). [Despliegue y build](https://vercel.com/rodyx-dev/miga-y-cacao-demo/C6Z1r2FLLQ392ebTvKrMATP1WEw6).

Resultado: las fallas reproducidas se corrigieron y no quedaron fallas detectadas pendientes en los recorridos ejecutados. Se conservaron las reglas y los registros válidos de la versión anterior. Esto es una revisión concreta del código y de esta publicación, no una garantía de ausencia de vulnerabilidades.

## Alcance y modelo de seguridad

Aplicación estática de React/Vite con IndexedDB. No existen un backend de compras, consultas SQL, cuentas privadas, pagos ni mensajes reales. Cada navegador, perfil y origen mantiene su propia demo. Se revisaron dominio, persistencia, migración, formularios, rutas, documentos, CSV, dependencias, archivos publicados y cabeceras. Los recorridos usan perfiles temporales y datos ficticios; no leen ni reemplazan el perfil del visitante.

Los roles y las credenciales son públicos y simulados. Comprobar permisos en el dominio conserva las reglas de la demo, pero no crea una frontera de autorización: el propietario del navegador puede modificar su propio código o IndexedDB. La aplicación no firma el historial ni puede detectar una manipulación que reconstruya de forma coherente todos los registros. Para usar datos reales con varios usuarios harían falta autenticación y autorización en servidor, almacenamiento protegido y respaldos.

## Hallazgos y correcciones

| Hallazgo | Impacto en esta demo | Corrección y comprobación |
| --- | --- | --- |
| Validación incompleta de registros guardados | Integridad y disponibilidad local: se admitían nombres como objetos, cantidades exponenciales, consumos positivos, fechas imposibles y referencias incoherentes. | Validación de tipos, longitudes, fechas de calendario, responsables, signos de movimientos, reversiones, estados y saldos de compras, conteos y relaciones de comprobantes. Los registros incompatibles se rechazan y conservan sin restablecimiento automático. |
| Comprobantes con relaciones inválidas | Un comprobante podía sustituirse a sí mismo; faltaban comprobaciones de ciclos y correlación completa con operaciones. | Relaciones recíprocas sin ciclos, operación de origen, reversión completa, cantidades y partidas verificadas; correcciones con rol y motivo adecuados. |
| Cabeceras de seguridad ausentes | Faltaba defensa adicional del navegador contra inyección, incrustación y carga de recursos. | CSP efectiva, `nosniff`, `X-Frame-Options: DENY`, `no-referrer` y restricciones de permisos. Scripts inline, conexiones externas e incrustación bloqueados en el navegador de producción. |
| Marco de impresión sin sandbox | El escape HTML ya impedía que el texto capturado se interpretara como etiquetas; faltaba otra barrera ante futuras regresiones. | Marco con `allow-same-origin allow-modals` y sin `allow-scripts`. Se mantiene impresión y se prueba bloqueo de scripts incluso en una muestra de HTML sin escapar, fuera de la aplicación. |
| Neutralización limitada de CSV | Existía protección para operadores normales; se amplió a controles, caracteres invisibles y operadores de ancho completo. | Prefijo de texto y escape de comillas probados en casos adversariales y en el archivo descargado. No se abrieron ni ejecutaron fórmulas en Excel. |
| Referencias del conteo inicial de ejemplo | La secuencia de revisión estaba fijada en 1 para todos los insumos; el resumen se construía desde saldos finales. | Se reconstruye la referencia anterior al ajuste desde su historial. La muestra pública original tenía secuencias esperadas 3, 4 y 10 para azúcar, chocolate y vainilla. Se repara solo el conteo ficticio original y se agrega un evento de auditoría, sin cambiar movimientos, existencias ni compras. |

El esquema sigue en versión 2. Los datos válidos generados por la demo anterior continúan siendo compatibles. La reparación específica del conteo de ejemplo incrementa la revisión una sola vez. No se utiliza una reparación genérica para aceptar registros corruptos.

## Inyecciones y exposición

React muestra los campos de usuario como texto. Órdenes, recepciones y conteos escapan caracteres HTML en títulos, tablas, observaciones y datos de referencia. Se probaron etiquetas script, imágenes con onerror, SVG con onload, cierres de style, enlaces javascript, srcdoc y variantes de marcado. No se detectó ejecución de los payloads capturados en la interfaz ni en los documentos. También se probaron parámetros y fragmentos maliciosos de URL.

La CSP permite scripts únicamente del propio origen y bloquea scripts inline y eval. `connect-src 'none'` bloquea conexiones; `frame-ancestors 'none'` impide incrustación; `object-src 'none'`, `base-uri 'none'` y `form-action 'none'` restringen otras superficies. Se permite estilo inline porque la interfaz y los documentos lo usan; esta excepción no permite scripts inline. El HTTPS de Vercel conserva HSTS. Se siguieron [las cabeceras de Vercel](https://vercel.com/docs/cdn-security/security-headers) y [la prevención de XSS de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).

Las solicitudes públicas a archivos de entorno, configuración Git, vinculación Vercel, fuentes TypeScript, páginas de pruebas y mapas del bundle no entregaron esos archivos. El bundle no contiene los patrones de tokens y claves privadas buscados. No se abrieron archivos locales de credenciales. El CORS público de los recursos estáticos no concede acceso al IndexedDB del visitante. La publicación contiene cuatro archivos estáticos verificados por SHA-256.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| Reglas, migración, documentos y seguridad en Node | 83/83, incluidas 36 pruebas nuevas de seguridad |
| Build remoto de Vercel | 83/83 y build correcto |
| IndexedDB real: idempotencia, conflictos, abortos y recuperación | 13/13 |
| Regresión de inventario y compras en Edge | 12/12 y 14/14 |
| Build estático y conflictos entre pestañas | 10/10 |
| Seguridad en producción sin sesión de Vercel | 15/15 |
| Funciones principales en producción | 10/10 |
| Actualización con registros capturados en la producción 0.5.0 | Correcta; conserva catálogo, saldos, movimientos, órdenes y recepciones |
| Accesibilidad de la producción corregida | 28 vistas sin infracciones automáticas y 4 pruebas de teclado aprobadas |
| Vulnerabilidades conocidas reportadas por npm audit | 0 al momento de la consulta |
| Errores de JavaScript en los recorridos finales | Ninguno |

El caso de migración de almacenamiento usa ahora un estado antiguo válido: fase 3 no podía generar recepciones editables de fase 4. Un estado falsificado que retire comprobantes y deje compras huérfanas se rechaza sin sobrescribirlo. Se mantiene la prueba de migración válida y de migración abortada.

La impresión comprueba el botón, el documento HTML y el sandbox; no abrió un diálogo del sistema ni generó un PDF adicional. Las descargas CSV se revisaron como archivos. No se verificaron Safari, Firefox ni aplicaciones de hojas de cálculo. La revisión automática de accesibilidad y npm audit no certifican seguridad completa ni cubren vulnerabilidades aún desconocidas.

## Evidencias y reproducción

- `tests/security.test.mjs`: reglas adversariales ejecutadas por `npm test`.
- `tests/browser-security.mjs`: sin `DEMO_URL`, sirve el build con las cabeceras de Vercel en un servidor temporal; con esa variable, comprueba la URL indicada.
- `tests/browser-upgrade.mjs`: verifica la muestra ficticia 0.5.0 capturada antes de publicar 0.5.1; usar `UPGRADE_FIXTURE` para cambiar su ubicación.
- `.test-build/security-summary.json`: resumen, cabeceras efectivas y hashes de archivos públicos.
- `.test-build/security-vercel-security/security.json`, `security-vercel-public/public.json` y `security-vercel-accessibility/accessibility.json`: informes de producción.
- `.test-build/security-upgrade-0.5.0.json`: muestra ficticia para la prueba de actualización, sin datos del visitante.
- `artifacts/miga-y-cacao-demo-0.5.1.zip` y su manifiesto: paquete estático correspondiente a producción.

Estas evidencias, las herramientas de prueba y la documentación están excluidas de la publicación. Véase [la guía de ejecución](DESPLIEGUE.md).
