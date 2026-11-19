# Seguridad

## Qué protege la app

| Riesgo | Protección | Cómo se verificó |
|---|---|---|
| Que los datos salgan de la computadora | Política de seguridad (CSP): `connect-src 'none'`, `default-src 'none'`. No hay servidor: todo se procesa en el navegador. | Prueba en Chromium con un servidor simulado. Los intentos con `fetch`, `XMLHttpRequest`, imágenes, scripts externos y `sendBeacon` **no llegaron**: el navegador los frenó por la política. La misma prueba sin la política sí llega. |
| Código inyectado (por ejemplo, un Excel armado para engañar al lector) | Solo corren los 6 scripts de la app, autorizados por su huella SHA-256. Un script agregado, un script externo o `eval` se bloquean. | Misma prueba: un script inyectado y `eval` no corrieron. |
| Que otra página muestre la app dentro de un marco para engañar al usuario | La app se oculta si detecta que está dentro de otra página. | Prueba en Chromium: incrustada desde otro sitio, la app no se muestra. |
| Que alguien cambie la app publicada | Solo la dueña o el dueño del repositorio puede subir cambios. La rama principal está protegida. Se publica únicamente lo que pasó la verificación. | Configuración de la cuenta y del repositorio (ver la lista de control). |
| Que se publique una versión rota o alterada | La verificación corre las pruebas y compara `index.html` con lo que sale de las fuentes. Si algo no coincide, no publica. | Simulado: un `index.html` tocado a mano hace fallar la verificación. |
| Que se suba un dato judicial al repositorio | `.gitignore` y una verificación que falla si hay archivos Excel o CSV. Lo publicado contiene solo `index.html`. | Simulado: una planilla agregada hace fallar la verificación. |
| Librería de terceros modificada | La librería de Excel (SheetJS 0.18.5) está **incluida dentro** de `index.html`, con la versión fijada en `package-lock.json`. No se descarga nada al usar la app. | Revisado en el armado. |

## Qué no puede proteger

- **La cuenta de GitHub.** Si alguien entra a la cuenta, puede cambiar la app. Por eso son obligatorios la verificación en dos pasos y una contraseña única.
- **La computadora de quien la usa.** Un virus en la PC puede leer los archivos antes o después de que pasen por la app.
- **Las bases en la carpeta compartida.** Su protección depende de los permisos del fileserver o del Drive. La app detecta si una base fue editada a mano (por la huella), pero no impide que alguien la copie.
- **Enlaces falsos.** Usar siempre la dirección guardada en favoritos, nunca una que llegue por correo.
- Ningún sistema es invulnerable. Estas medidas eliminan los riesgos habituales para una página como esta: sin servidor, sin usuarios y sin datos guardados.

## Lista de control de la cuenta y del repositorio

- [ ] Verificación en dos pasos activada en la cuenta de GitHub.
- [ ] Contraseña única, que no se use en otro sitio.
- [ ] Rama `main` protegida: sin borrado ni reescritura del historial.
- [ ] Acciones de GitHub limitadas a las publicadas por GitHub.
- [ ] Sin colaboradores con permiso de escritura, salvo quien tenga que mantener la app.
- [ ] GitHub Pages publicado desde **GitHub Actions** (no desde la rama), para que solo salga lo verificado.

## Cómo reportar un problema

Escribir a quien mantiene la app en la oficina de procesamiento de datos del Fuero Laboral. No abrir un *issue* público con detalles de un problema de seguridad.
