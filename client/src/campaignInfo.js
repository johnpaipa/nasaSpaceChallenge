// Información real que acompaña a cada capítulo de la campaña: una foto de la
// NASA, etiquetas temáticas, la misión real en la que se inspira y un dato curioso. Las fotos
// (client/public/campaign) vienen de images.nasa.gov; los pasos de diseño, del
// seminario de la NASA "Design and Develop Science Missions" (2025).
import { t } from '../../shared/i18n.js';

export const REAL = {
  wildfire: {
    image: '/campaign/wildfire.jpg', credit: 'NASA / Frank Michaux', place: () => t('Órbita terrestre'),
    caption: () => t('Un cohete Atlas V despega de Cabo Cañaveral con el rover Perseverance, el 30 de julio de 2020.'),
    tags: [['satellite', () => t('Satélites')], ['flame', () => t('Incendios')], ['thermo', () => t('Infrarrojo')]],
    real: 'FIRMS',
    realText: () => t('El sistema FIRMS de la NASA usa los instrumentos MODIS y VIIRS para detectar incendios activos en todo el mundo y avisar en unas 3 horas.'),
    fact: () => t('Los satélites no buscan las llamas: detectan su calor con sensores infrarrojos, incluso de noche.'),
  },
  disaster: {
    image: '/campaign/disaster.jpg', credit: 'NASA / JSC', place: () => t('Órbita terrestre'),
    caption: () => t('El huracán Genevieve frente a la costa de México, fotografiado desde la Estación Espacial Internacional el 19 de agosto de 2020.'),
    tags: [['satellite', () => t('Satélites')], ['hurricane', () => t('Desastres')], ['radar', () => t('Radar')]],
    real: 'NISAR',
    realText: () => t('NISAR, de la NASA y la agencia espacial de la India, se lanzó en 2025. Su radar observa casi toda la tierra firme y el hielo del planeta dos veces cada 12 días.'),
    fact: () => t('Un radar envía sus propias microondas y mide el eco: por eso funciona de noche y atraviesa las nubes.'),
  },
  climate: {
    image: '/campaign/climate.jpg', credit: 'NASA / NOAA / GSFC · Suomi NPP VIIRS', place: () => t('Órbita terrestre'),
    caption: () => t('«Blue Marble 2012»: la Tierra vista por el satélite Suomi NPP el 4 de enero de 2012.'),
    tags: [['satellite', () => t('Satélites')], ['globe', () => t('Clima')], ['clock', () => t('Larga duración')]],
    real: 'Landsat',
    realText: () => t('El programa Landsat observa la Tierra sin pausa desde 1972: es el registro más largo de nuestro planeta visto desde el espacio. Landsat 9 se lanzó en 2021.'),
    fact: () => t('Para estudiar el clima hacen falta décadas de mediciones comparables: por eso importa tanto que un satélite dure.'),
  },
  moon_water: {
    image: '/campaign/moon_water.jpg', credit: 'NASA / JPL / USGS · Clementine', place: () => t('La Luna'),
    caption: () => t('El polo sur de la Luna en un mosaico de unas 1 500 imágenes de la sonda Clementine (1994).'),
    tags: [['rover', () => t('Rover')], ['moon', () => t('Luna')], ['drop', () => t('Hielo')]],
    real: 'LCROSS · LRO',
    realText: () => t('En 2009 la misión LCROSS estrelló una etapa de cohete en el cráter Cabeus y confirmó que había agua en el material que saltó. LRO cartografía la Luna desde ese mismo año.'),
    fact: () => t('Cerca de los polos lunares hay cráteres donde nunca da el Sol: allí el hielo puede conservarse miles de millones de años.'),
  },
  space_weather: {
    image: '/campaign/space_weather.jpg', credit: 'NASA / SDO', place: () => t('Punto L1, entre el Sol y la Tierra'),
    caption: () => t('Una llamarada solar de clase X vista en distintas longitudes de onda por el Observatorio de Dinámica Solar, el 24 de febrero de 2014.'),
    tags: [['satellite', () => t('Observatorio')], ['sun', () => t('Sol')], ['bell', () => t('Alerta temprana')]],
    real: 'SOHO · DSCOVR',
    realText: () => t('SOHO, lanzado en 1995, vigila el Sol desde el punto L1. A su lado, DSCOVR mide el viento solar y da entre 15 y 60 minutos de aviso antes de que una tormenta llegue a la Tierra.'),
    fact: () => t('En L1, a 1,5 millones de kilómetros, la gravedad del Sol y la de la Tierra se equilibran y una nave puede mirar al Sol sin interrupciones.'),
  },
  mars_life: {
    image: '/campaign/mars_life.jpg', credit: 'NASA / JPL-Caltech / MSSS', place: () => t('Marte'),
    caption: () => t('Selfie del rover Perseverance junto al helicóptero Ingenuity en el cráter Jezero, el 6 de abril de 2021.'),
    tags: [['rover', () => t('Rover')], ['planet', () => t('Marte')], ['sprout', () => t('Vida')]],
    real: 'Perseverance',
    realText: () => t('Perseverance aterrizó en el cráter Jezero el 18 de febrero de 2021. Busca señales de vida microbiana antigua y guarda muestras de roca en tubos para traerlas algún día a la Tierra.'),
    fact: () => t('El helicóptero Ingenuity hizo el primer vuelo con motor en otro planeta el 19 de abril de 2021.'),
  },
};

/** Los seis pasos con los que la NASA diseña una misión, y qué haces tú en cada uno. */
export const LIFECYCLE = [
  { icon: '🎯', title: () => t('Necesidad y metas'), text: () => t('Lee el encargo del capítulo.') },
  { icon: '💡', title: () => t('Concepto'), text: () => t('Elige la órbita y el tipo de misión.') },
  { icon: '📋', title: () => t('Requisitos'), text: () => t('Respeta presupuesto, plazo y vida útil.') },
  { icon: '✏️', title: () => t('Diseño'), text: () => t('Arma la nave y sus instrumentos.') },
  { icon: '🔧', title: () => t('Construir y verificar'), text: () => t('Ensambla el cohete en el hangar.') },
  { icon: '🚀', title: () => t('Operar'), text: () => t('Lanza, explora y lee tu reporte.') },
];
export const LIFECYCLE_SOURCE = 'https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf';

export const RESOURCES = [
  { label: () => t('Cómo se diseña una misión científica'), url: LIFECYCLE_SOURCE },
  { label: () => 'CubeSat 101', url: 'https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf' },
  { label: () => t('Laboratorio de diseño de misiones (Goddard)'), url: 'https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab/' },
  { label: () => t('Juego: arma el telescopio Webb'), url: 'https://science.nasa.gov/mission/webb/game-build-it-yourself/' },
];
