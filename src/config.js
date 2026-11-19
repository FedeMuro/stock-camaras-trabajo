/* Configuración por sede y catálogo del fuero.
   Se edita sin tocar el motor: agregar una sede = agregar un objeto a SEDES. */
(function (root) {
  'use strict';

  // Catálogo común a todo el fuero (texto exacto).
  const CATALOGO = {
    resolucionesAdmitidas: [
      'Sentencia',
      'Sentencia (Juzg.Lab.-Ejecutivos)',
      'Sentencia s/fondo (para salas)',
      'Acuerdo (Sentencia Homologación)',
      'Acuerdo (Sentencia Homologatoria para Salas)',
      'Desistimiento de la Acción y Derecho (Sentencia Homologación)',
      'Desistimiento de la Acción y del Derecho (Sentencia que lo resuelve)',
      'Desistimiento de la Acción (Sentencia Homologación)',
      'Desistimiento de la Acción (Sentencia que lo resuelve)'
    ],
    avocamiento: {
      'Avocamiento': 'Avocamiento expreso',
      'Audiencia de Vista de la Causa (decreto que la fija)': 'Decreto que fija AVC',
      'Audiencia de Vista de la Causa - Acta': 'Acta de AVC',
      'Audiencia de Vista de la Causa Continuación (decreto que la fija)': 'Decreto que fija continuación',
      'Audiencia de Vista de la Causa Continuación - Acta': 'Acta de continuación'
    },
    // Palabras que vuelven "candidata" a una denominación desconocida.
    raicesCandidatas: ['Sentencia', 'Acuerdo', 'Desistimiento'],
    // Una denominación con esta palabra es un auto (p. ej. "Acuerdo (Auto que lo homologa)").
    marcaAuto: /\bAuto\b/i,
    // Decisión 14/11/2026: si la causa solo tiene un auto, se da por resuelta como
    // "Resuelta con operación Auto" y queda un aviso permanente para cargar la Sentencia.
    // En false, el auto no resuelve y la causa sigue pendiente.
    autosCierran: true,
    // Equivalencias aprobadas que todavía no están en la tabla de códigos.
    // Si la tabla las trae, manda la tabla. Cada una con su origen.
    equivalenciasExtra: {
      'RECURSO DE QUEJA': { tipoProceso: 'Otros', origen: 'Aprobada por Fede el 18/11/2026' },
      'OFICIO RECIBIDO': { tipoProceso: 'Otros', origen: 'Aprobada por Fede el 18/11/2026' }
    }
  };

  const SEDES = {
    'san-francisco': {
      id: 'san-francisco',
      nombre: 'Cámara del Trabajo - San Francisco',
      nombreArchivo: 'San Francisco',
      tipo: 'especializada',
      localidad: 'SAN FRANCISCO',
      dependencias: {
        'CAMARA DEL TRABAJO - SAN FRANCISCO': 'Cámara del Trabajo'
      },
      gruposLaborales: ['CAMARAS DEL TRABAJO - SAN FRANCISCO'],
      causalElevacion: 'ELEVACION A JUICIO',
      resolucionesExtra: [] // variantes aprobadas propias de la sede
    },
    'cruz-del-eje': {
      id: 'cruz-del-eje',
      nombre: 'Cámara Apel. Civ. Com. Trabajo y Flia. - Cruz del Eje',
      nombreArchivo: 'Cruz del Eje',
      tipo: 'multifuero',
      localidad: 'CRUZ DEL EJE',
      dependencias: {
        'CAMARA APEL. CIV.COM.TRABAJO Y FLIA S. LAB - CRUZ DEL EJE': 'SEC. LABORAL',
        'CAMARA APEL. CIV.COM.TRABAJO Y FLIA S. CIV - CRUZ DEL EJE': 'SEC. CIVIL'
      },
      gruposLaborales: ['CAMARAS DEL TRABAJO - CRUZ DEL EJE'],
      causalElevacion: 'ELEVACION A JUICIO',
      resolucionesExtra: []
    }
  };

  const api = { CATALOGO, SEDES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StockConfig = api;
})(typeof window !== 'undefined' ? window : globalThis);
