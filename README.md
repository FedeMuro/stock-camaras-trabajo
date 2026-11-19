# Stock de causas pendientes · Cámaras del Trabajo (Córdoba)

App para calcular cada mes el stock de causas pendientes de resolución de las Cámaras del Trabajo, a partir de los reportes oficiales del SAC. Reemplaza las planillas con BUSCARV por un cálculo determinista y auditable.

**Usar la app:** `https://<usuario>.github.io/<repositorio>/` (reemplazar por la dirección real una vez publicada).

## Privacidad

- La app es **una sola página**. Los Excel que se arrastran se procesan **dentro del navegador** de quien la usa.
- **No hay servidor ni base de datos.** Los reportes, las bases y los informes no se suben a ningún lado.
- La página tiene una política de seguridad que **le prohíbe al navegador conectarse a cualquier servidor**. Aunque alguien lograra inyectarle código, los datos no tendrían por dónde salir.
- Este repositorio contiene **solo código**. Nunca se suben planillas: la verificación automática frena cualquier cambio que incluya archivos Excel o CSV.

## Cómo se usa

La guía completa está en [GUIA.md](GUIA.md). En resumen, cada mes y para cada sede:

1. Abrir la app.
2. Arrastrar la **base del último cierre** (desde la carpeta compartida) y los **4 reportes del SAC**: foto, remisiones, resoluciones y avocamiento/AVC.
3. Calcular la vista previa y revisar el stock, la conciliación, las causas a revisar y los avisos.
4. Confirmar el cierre. Se descargan la **nueva base** (va a la carpeta compartida) y el **informe**.

## Qué hay en el repositorio

| Carpeta / archivo | Qué es |
|---|---|
| `index.html` | La app publicada: un solo archivo, sin dependencias externas. Se genera desde `src/`. |
| `src/` | Las fuentes: motor de reglas (`engine.js`), configuración de sedes y catálogo (`config.js`), lectura y escritura de Excel (`io.js`), interfaz (`ui.js`), plantilla (`app.src.html`), armado con la política de seguridad (`build-html.js`) y pruebas (`tests.js`). |
| `pruebas-navegador/` | Pruebas de punta a punta en Chromium. Necesitan los reportes reales, que **no** están en el repositorio. |
| `herramientas/` | Scripts usados una sola vez para armar las bases iniciales de San Francisco y Río Cuarto. |
| `.github/workflows/verificar.yml` | Verificación automática: sin datos, pruebas del motor, `index.html` igual a las fuentes. Solo si todo pasa, publica. |
| `SECURITY.md` | Qué protege la app, qué no, y la lista de control de la cuenta. |

## Cómo se modifica

1. Cambiar los archivos de `src/`. Por ejemplo, en `config.js` se agrega una equivalencia aprobada o una variante de resolución.
2. Regenerar la app y correr las pruebas:
   ```
   npm ci
   npm test
   npm run build
   ```
3. Subir los cambios (`src/` e `index.html`). La verificación corre sola y, si pasa, publica la nueva versión.

Nunca editar `index.html` a mano: la verificación lo detecta y no publica.
