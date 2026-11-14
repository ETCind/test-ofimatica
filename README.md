# Test Ofimática C2 — versión 5 con correcciones de seguridad de importación

Este paquete es el **código de la aplicación**, no una biblioteca de tests ni un PDF para importar.
El repositorio previsto es `test-ofimatica` (independiente del proyecto de Legislación).
El almacenamiento del navegador sigue usando la misma base IndexedDB (`TestOfimaticaC2Universal`).

## Qué cambia

- Reconstruye y valida los cuestionarios antes de guardarlos; evita aceptar un examen de 24 preguntas como si solo tuviera 2 o 3.
- Admite el formato ALPE con cuestionario, plantilla de respuestas y fichas explicativas, además de los PDF directos de preguntas/respuestas.
- Conserva, cuando las encuentra, las imágenes de las preguntas (fragmento del PDF original con icono, tabla o gráfico). No confunde el logo de la academia con una imagen de examen.
- Si una pregunta exige una ilustración, la exportación de biblioteca exige que la imagen esté incorporada; no crea una respuesta a partir del dibujo ni omite la ilustración silenciosamente.
- La importación de lotes y restauración de biblioteca se ejecutan en una sola transacción IndexedDB: un fallo revierte todo el lote.
- La aplicación solicita una copia de seguridad y confirmación antes de reemplazar una biblioteca maestra.
- Reconoce las anulaciones **122 y 130** de Tramitación Procesal 2026 (modelo B). Las reservas **137 y 138** sustituyen a las anuladas; **139 y 140** se conservan sin puntuación. Esto **no** se aplica a otros modelos.
- Incluye `autotest.html`, que analiza con el PDF.js real en el navegador un PDF interno de prueba de cuatro preguntas antes de permitir importar.

## Validación realizada

Pruebas locales de reconstrucción sobre **7 PDF de exámenes (235 preguntas)** y **3 PDF sintéticos con gráficos (12 preguntas)**: 247/247 preguntas, 988 alternativas, sin campos vacíos. Verificación oficial disponible para las 44 preguntas de cada modelo A y B de Auxiliar del Estado 2024 (INAP) y las anulaciones y reservas de Tramitación Procesal 2026. Prueba de transacciones atómicas con error forzado y recuperación de datos; validación geométrica de seis iconos del examen de Cantabria 2021.

**Límite de la validación:** no se ha ejecutado una prueba de extremo a extremo con el motor PDF.js en Safari en el Mac del usuario ni en GitHub Pages; no puede garantizarse compatibilidad universal con futuros archivos (en especial, PDF escaneados sin texto, formatos de examen no conocidos o gráficos vectoriales complejos). Las claves históricas de Cantabria 2016/2021 y Auxiliar 2023 no están cotejadas con una plantilla definitiva independiente en esta revisión.

## Instalación y comprobación

1. Antes de cualquier cambio, exportar y conservar una copia JSON de la biblioteca actual desde la aplicación.
2. En GitHub, subir a **la raíz** del repositorio todos los archivos y la carpeta `assets` de este ZIP, conservando la configuración existente de Pages. No eliminar ni reemplazar la biblioteca local.
3. Abrir `https://etcind.github.io/test-ofimatica/autotest.html` desde Safari. Solo continuar si todas las comprobaciones indican OK, especialmente «Importación PDF real de extremo a extremo».
4. En la aplicación principal, importar un PDF original y comprobar el número de preguntas, opciones, respuestas e imágenes antes de guardarlo.
5. Si cualquier prueba falla o no aparece la imagen necesaria, **no guardar** el test. Devolver el informe y corregir el código antes de proseguir.

**NO** borrar datos del sitio ni cambiar de dominio: la biblioteca reside en el almacenamiento local del navegador.

## Independencia de proyectos

Los tests y resultados de Legislación no forman parte de este repositorio ni de su biblioteca.

La auditoría técnica completa se entrega por separado en `INFORME_AUDITORIA_V5.md`.
