# App de stock de causas — Guía de uso y limitaciones (v1.4, reglas 2.3)

La app es una sola página. Se usa desde la **dirección web** publicada en GitHub Pages o desde el archivo `index.html` abierto en la PC: son la misma app y dan el mismo resultado. Los Excel se procesan en el navegador y no se envían a ningún lado.

## Qué necesitás cada mes

1. **La base del último cierre de la sede**, desde la **carpeta compartida** (fileserver o Drive). Es el archivo `Base_<sede>_<corte>_cierre<N>_<quien>.xlsx` más reciente.
    - Bases de partida: `Base_San_Francisco_2026-11-03.xlsx`, `Base_Cruz_del_Eje_2026-11-02.xlsx` y `Base_Rio_Cuarto_2026-10-30_cierre1.xlsx`.
    - Las bases guardadas con versiones anteriores de la app se siguen leyendo sin problema.
2. **Los 4 reportes del SAC** de la sede, descargados el mismo día:
    - Foto de expedientes, en lo posible con **todos los estados**.
    - Remisiones.
    - Resoluciones.
    - Avocamiento y AVC.
3. **La tabla de códigos** (`Códigos EN GRAL.xlsx`), solo si cambió. La base ya guarda la última que se usó.

## Carpeta compartida y trabajo a la par

Estructura sugerida en el fileserver o en el Drive:

```
Stock Cámaras/
  San Francisco/   Base_San_Francisco_2026-11-03.xlsx
                   Informes/
  Cruz del Eje/    Base_Cruz_del_Eje_2026-11-02.xlsx
                   Informes/
  Río Cuarto/      Base_Rio_Cuarto_2026-10-30_cierre1.xlsx
                   Informes/
```

Reglas para trabajar los dos sobre las mismas sedes:

1. **Cada mes, una sola persona confirma cada sede.** Repártanse las sedes o avisen antes de cerrar una.
2. **Siempre partir de la base más nueva de la carpeta.** El nombre lleva el número de cierre y quién lo confirmó (por ejemplo, `..._cierre2_Fede.xlsx`).
3. **Al terminar, guardar enseguida la base nueva en la carpeta de la sede** y el informe en `Informes/`.
4. **Si se cruzan**, la app lo detecta:
    - Con dos bases distintas del mismo cierre (por ejemplo, `cierre2_Ana` y `cierre2_Fede`), frena y pide elegir cuál vale. La otra conviene borrarla de la carpeta.
    - Con una base vieja junto a una nueva, usa la nueva y avisa que ignoró la vieja.
    - Con una base vieja que no es antecesora de la nueva (hubo cierres en paralelo), lo marca en rojo.

## Paso a paso

1. **Abrí la app**: la dirección web guardada en favoritos, o `index.html`.
2. **Arrastrá todos los archivos juntos** al recuadro punteado: la base, los 4 reportes y, si cambió, la tabla.
    - La sede se elige sola según la base.
    - Si es el primer cierre de una sede que ya está en la lista, elegila.
    - Si la sede no está en la lista, mirá "Sede nueva", más abajo.
3. **Revisá la lista "Reportes reconocidos":**
    - Cada reporte tiene que figurar con su tipo y con "columnas completas".
    - Si el SAC cambió el nombre de una columna, tocá **Mapear columnas** y elegí cuál es.
    - Si un tipo quedó mal reconocido, cambialo en la lista desplegable.
    - Los cinco indicadores de abajo tienen que estar en verde.
    - Si ninguna fila de la foto es de la sede elegida, la app lo avisa y ofrece configurarla como sede nueva.
4. **Calculá la vista previa.**
    - La fecha de corte sugerida es la del evento más reciente de los reportes. Confirmala o cambiala. Si la cambiás, volvé a calcular.
    - Si la fecha no es posterior al último cierre, la app no deja seguir. El cierre anterior nunca se modifica.
5. **Revisá la vista previa:**
    - **Stock pendiente** y la **conciliación** con el mes anterior: anterior − salen + entran = actual. Tiene que decir "cierra".
    - Los **avisos de cobertura** (en amarillo). Por ejemplo, un reporte al que le falta un tipo de resolución en el filtro, o una foto que trae solo las causas activas.
    - Las **causas a revisar** (ver "Qué calcula").
    - Los **avisos por expediente**, agrupados por tipo. Clic en un número de SAC para abrir su ficha.
    - Los **movimientos**: qué causas entraron y salieron, y por qué.
    - Si la sede tiene más de una secretaría, la **apertura por secretaría**.
6. **Anotaciones manuales (opcional).** En la ficha de un expediente podés cargar:
    - Observación.
    - Vocal.
    - Reclasificación del tipo de proceso, con su motivo.

   Se guardan en la base, con registro de quién las hizo, y se mantienen todos los meses.
7. **Confirmá el cierre.** Escribí tu nombre y tocá **Confirmar cierre y descargar**. Se bajan dos archivos:
    - La **nueva base**, que va a la carpeta compartida de la sede.
    - El **informe** en Excel, con estas hojas: Portada, Resumen (con fórmulas), Consolidado, Stock pendiente, Movimientos, Causas a revisar, Avisos, Eventos e Insumos.

   Si solo querés mirar los números sin cerrar el mes, usá **Descargar solo el informe (borrador)**.

## Sede nueva (sin tocar el código)

1. En el paso 1, elegí **＋ Sede nueva…**.
2. En el paso 2, arrastrá los reportes de la sede y la tabla de códigos. Con la foto alcanza para configurar la sede; los otros tres se necesitan para el cierre.
3. Aparece el formulario **Configurar la sede**, completado a partir de los reportes:
    - **Nombre** y **nombre corto**: se sugieren a partir de la localidad. El nombre corto se usa en los archivos y no puede repetir el de otra sede.
    - **Tipo**:
        - Especializada: todo lo de esas dependencias es del fuero laboral.
        - Multifuero: solo cuenta el universo laboral.
    - **Causal de elevación**: por defecto, ELEVACION A JUICIO.
    - **Dependencias**: se listan las que aparecen en la foto, con la cantidad de filas de la foto y de remisiones de cada una. Marcá las que forman la sede y poné el nombre de cada secretaría.
    - **Grupos laborales** (solo multifuero): marcá cuáles son del fuero laboral. Además entran, de cualquier grupo, los tipos de juicio de materia Laboral.
4. Tocá **Usar esta sede** y seguí con el paso 3, como en cualquier cierre.
5. La configuración queda guardada **dentro de la base** que se descarga al confirmar. Al cargar esa base en cualquier PC, la sede aparece sola.
6. Mientras la sede no tenga un cierre confirmado, se puede corregir con **Editar configuración**. Después queda fija, para no cambiar el universo de cierres ya hechos.

## Qué calcula

- **Stock pendiente:** causa de tipo de proceso Ordinario, presente en la foto del SAC al corte, en estado ACTIVO y sin resolución.
- **Sedes multifuero** (por ejemplo, Cruz del Eje): se cuenta solo el universo laboral, es decir, causas del grupo del trabajo o de un tipo de juicio con materia Laboral.
    - Las de materia Laboral cargadas en un grupo no laboral **cuentan** en el stock y además generan un aviso.
- **Resolución:** la más reciente del catálogo de resoluciones admitidas. Sentencia, Desistimiento y Acuerdo (Sentencia Homologación) valen todos como sentencia: la causa está resuelta.
- **Una causa resuelta no se reabre** (decisiones del 18/11/2026):
    - Si después de la resolución la causa bajó al juzgado y volvió con otra "ELEVACION A JUICIO", ese movimiento está mal cargado. La causa se sigue contando como resuelta.
    - Lo mismo si vuelve a figurar ACTIVA.
    - Esas causas van a la hoja **"Causas a revisar"** del informe, con la resolución, su fecha y la fecha del movimiento a corregir, para que la sede lo corrija en el SAC antes de la próxima foto.
    - La única reapertura legítima es el reenvío del TSJ después de anular la sentencia, y ese ingreso tiene otra causal, no ELEVACION A JUICIO.
- **Autos** (por ejemplo, "Acuerdo (Auto que lo homologa)") sin sentencia:
    - La causa queda **"Resuelta con operación Auto"** y sale del stock.
    - Cada mes aparece un aviso para borrar el auto en el SAC y cargar la Sentencia.
- **Reclasificación manual** (por ejemplo, a "Recurso de apelación"):
    - Prevalece sobre la tabla de equivalencias y se recuerda todos los meses.
    - Lleva su aclaración. Si la causa se remitió con causal ELEVACION A JUICIO, está mal remitida: la causal correcta es RECURSO DE APELACION.
- **Equivalencias aprobadas fuera de la tabla** (bloque `equivalenciasExtra` de `src/config.js`):
    - RECURSO DE QUEJA = Otros y OFICIO RECIBIDO = Otros, aprobadas por Fede el 18/11/2026.
    - La columna "Equivalencia aprobada fuera de la tabla" del informe las muestra.
    - Si un día la tabla de códigos trae ese tipo de juicio, manda la tabla.
- **Elevación:** la primera remisión con la causal de elevación de la sede. El año de elevación sale de esa fecha.
- **Avocamiento:** Sin avocamiento / Avocada sin operación de AVC / Avocada con operación de AVC.
- **Lo acreditado persiste:** una causa que no aparece en la foto no se borra ni se resuelve. Queda como "No encontrada en el corte actual", con su último estado conocido.

## Seguridad (resumen; detalle en SECURITY.md)

- La página no puede conectarse a ningún servidor: lo impide su política de seguridad. Se verificó en Chromium con un servidor simulado, y ningún intento de sacar datos llegó.
- Solo corren los scripts propios de la app. Un script inyectado o externo se bloquea.
- Si otra página intenta mostrarla dentro de un marco, la app se oculta.
- El repositorio tiene solo código. La verificación automática frena cualquier planilla, corre las pruebas y publica únicamente si todo pasa.

## Validación con datos reales

**San Francisco, al 03/11: 1.819 pendientes.**
- La planilla al 01/11 daba 1.832. Las diferencias se explican expediente por expediente:
    - 13 se resolvieron el 03/11.
    - 2 no figuran en la foto del SAC.
    - 1 volvió a la Cámara.
    - 1 elevación nueva.
- Los 207 desistimientos que el reporte del SAC no traía se tomaron de la planilla.

**Cruz del Eje, al 02/11: 1.197 pendientes** (1.165 de la Sec. Laboral y 32 de la Sec. Civil).
- Coinciden expediente por expediente con el listado de la sede, incluidos el avocamiento y el año de elevación.
- El resumen de la sede dice 1.196. La diferencia es el expediente 1840274: tipo "ORDINARIO" genérico, de materia Transversal, en el grupo del trabajo.
- La tabla dinámica de la sede está desactualizada respecto de su propio listado.
- El expediente de OFICIO RECIBIDO (9592253) queda como Otros.

**Río Cuarto, al 30/10: 2.513 pendientes** (1.250 de la Secretaría 1 y 1.263 de la Secretaría 2).
- Configurada con "Sede nueva" a partir de sus reportes, que vinieron completos: foto con todos los estados y filtro de resoluciones con los 9 tipos.
- Coinciden expediente por expediente con la hoja "Stock 2-11-26" de la planilla de la sede, incluidos el avocamiento y el año de elevación.
- 5 causas a revisar (2234609, 2586233, 2648897, 3574167 y 11683469): resueltas y después elevadas de nuevo.
- El expediente de RECURSO DE QUEJA (8368453) queda como Otros.

**Pruebas:**
- 27 pruebas automáticas del motor. Incluyen una simulación de 5 meses, las equivalencias aprobadas fuera de la tabla y la lectura de una base guardada por una versión anterior.
- Pruebas en navegador con los Excel reales:
    - primer cierre, mes siguiente, anotaciones, base vieja y vista en celular;
    - sede nueva;
    - seguridad: salida de datos, scripts inyectados y marco;
    - trabajo a la par: dos cierres del mismo mes, y base vieja junto a una nueva.
- Las 126 fórmulas del informe se recalcularon en LibreOffice y dan lo mismo que la app.

## Limitaciones

1. **Foto solo de activos (Cruz del Eje).**
    - No se pueden detectar reactivaciones ni distinguir por qué una causa deja de figurar.
    - La app lo avisa en la portada.
    - Para el próximo mes conviene descargar la foto con todos los estados.
2. **Pendientes sin fecha de elevación:** 31 en San Francisco, 356 en Cruz del Eje y 451 en Río Cuarto.
    - Los reportes de remisiones no tienen la elevación de esas causas.
    - En Río Cuarto el reporte empieza en febrero de 2016 y la mayoría de esas causas se iniciaron antes de 2013. La planilla de la sede las rotula "Sin Info/anteriores a 2016".
    - Figuran como "Sin fecha" y con un aviso.
3. **Rectificar un cierre confirmado:** no hay un botón para hacerlo. Se rehace partiendo de la base del cierre anterior, porque cada base descargada es una copia completa.
4. **Base vieja cargada sola:**
    - Si se carga junto con la nueva, la app avisa.
    - Si se carga sola, solo avisa en la computadora donde se confirmó el cierre más nuevo.
    - Por eso la regla es partir siempre de la base más nueva de la carpeta compartida.
5. **Sedes nuevas:**
    - Antes del primer cierre, la configuración vive solo en la computadora donde se creó. Si se borran los datos del navegador, hay que volver a cargarla.
    - Después de un cierre confirmado, la configuración ya no se puede editar desde la app.
    - Las variantes de resolución propias de una sede y las equivalencias aprobadas fuera de la tabla se agregan editando `src/config.js` y republicando.
6. **Formato del informe:** sin colores ni negritas, porque la versión libre de la librería de Excel no los escribe. Sí tiene anchos de columna y fórmulas.
7. **Librería de Excel incluida:** SheetJS 0.18.5, la última publicada en npm. Hay versiones más nuevas en el sitio de SheetJS. Para reportes del SAC no hace diferencia.
8. **Campos de la planilla de San Francisco no importados:**
    - Firmeza del avocamiento, AVC agendada, vencimiento de alegatos y "Programa disminución". Estaban vacíos o eran derivados.
    - Se importaron Carátula (875), Observación (61), Vocal (1) y 12 reclasificaciones a Recurso de apelación.
9. **Reenvío por anulación del TSJ:**
    - Si se anula una sentencia y la causa vuelve a la sede para un nuevo fallo, hoy la app la sigue contando como resuelta, porque ese ingreso no es ELEVACION A JUICIO.
    - Cuando se conozca el nombre exacto de esa causal en el SAC, se puede agregar como reapertura automática.
10. **Fuera de alcance:** la firmeza y los días hábiles.
