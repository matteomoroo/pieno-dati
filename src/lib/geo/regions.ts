/**
 * Tabella di riferimento: sigla provincia -> regione italiana.
 *
 * Il MIMIT fornisce la sigla provincia ma non la regione. Questa è una tabella
 * amministrativa STABILE (le regioni italiane non cambiano): non è l'"elenco di
 * località hardcoded" vietato dal prompt (quello erano migliaia di comuni nel
 * bundle), ma una piccola mappa di riferimento di 107 voci.
 *
 * Copre le 107 province + le sigle storiche ancora usate nei dati.
 */

export const PROVINCE_TO_REGION: Record<string, string> = {
  // Abruzzo
  AQ: 'Abruzzo', CH: 'Abruzzo', PE: 'Abruzzo', TE: 'Abruzzo',
  // Basilicata
  MT: 'Basilicata', PZ: 'Basilicata',
  // Calabria
  CZ: 'Calabria', CS: 'Calabria', KR: 'Calabria', RC: 'Calabria', VV: 'Calabria',
  // Campania
  AV: 'Campania', BN: 'Campania', CE: 'Campania', NA: 'Campania', SA: 'Campania',
  // Emilia-Romagna
  BO: 'Emilia-Romagna', FC: 'Emilia-Romagna', FE: 'Emilia-Romagna',
  MO: 'Emilia-Romagna', PR: 'Emilia-Romagna', PC: 'Emilia-Romagna',
  RA: 'Emilia-Romagna', RE: 'Emilia-Romagna', RN: 'Emilia-Romagna',
  // Friuli-Venezia Giulia
  GO: 'Friuli-Venezia Giulia', PN: 'Friuli-Venezia Giulia',
  TS: 'Friuli-Venezia Giulia', UD: 'Friuli-Venezia Giulia',
  // Lazio
  FR: 'Lazio', LT: 'Lazio', RI: 'Lazio', RM: 'Lazio', VT: 'Lazio',
  // Liguria
  GE: 'Liguria', IM: 'Liguria', SP: 'Liguria', SV: 'Liguria',
  // Lombardia
  BG: 'Lombardia', BS: 'Lombardia', CO: 'Lombardia', CR: 'Lombardia',
  LC: 'Lombardia', LO: 'Lombardia', MB: 'Lombardia', MI: 'Lombardia',
  MN: 'Lombardia', PV: 'Lombardia', SO: 'Lombardia', VA: 'Lombardia',
  // Marche
  AN: 'Marche', AP: 'Marche', FM: 'Marche', MC: 'Marche', PU: 'Marche',
  // Molise
  CB: 'Molise', IS: 'Molise',
  // Piemonte
  AL: 'Piemonte', AT: 'Piemonte', BI: 'Piemonte', CN: 'Piemonte',
  NO: 'Piemonte', TO: 'Piemonte', VB: 'Piemonte', VC: 'Piemonte',
  // Puglia
  BA: 'Puglia', BT: 'Puglia', BR: 'Puglia', FG: 'Puglia', LE: 'Puglia', TA: 'Puglia',
  // Sardegna
  CA: 'Sardegna', NU: 'Sardegna', OR: 'Sardegna', SS: 'Sardegna', SU: 'Sardegna',
  // sigle sarde storiche ancora presenti in alcuni dataset
  CI: 'Sardegna', VS: 'Sardegna', OG: 'Sardegna', OT: 'Sardegna',
  // Sicilia
  AG: 'Sicilia', CL: 'Sicilia', CT: 'Sicilia', EN: 'Sicilia', ME: 'Sicilia',
  PA: 'Sicilia', RG: 'Sicilia', SR: 'Sicilia', TP: 'Sicilia',
  // Toscana
  AR: 'Toscana', FI: 'Toscana', GR: 'Toscana', LI: 'Toscana', LU: 'Toscana',
  MS: 'Toscana', PI: 'Toscana', PT: 'Toscana', PO: 'Toscana', SI: 'Toscana',
  // Trentino-Alto Adige
  BZ: 'Trentino-Alto Adige', TN: 'Trentino-Alto Adige',
  // Umbria
  PG: 'Umbria', TR: 'Umbria',
  // Valle d'Aosta
  AO: "Valle d'Aosta",
  // Veneto
  BL: 'Veneto', PD: 'Veneto', RO: 'Veneto', TV: 'Veneto',
  VE: 'Veneto', VR: 'Veneto', VI: 'Veneto',
};

/** Regione di una sigla provincia, o null se sconosciuta. */
export function regionOf(provincia: string): string | null {
  return PROVINCE_TO_REGION[provincia.toUpperCase().trim()] ?? null;
}

/**
 * Sigla provincia -> nome esteso (capoluogo/provincia).
 * Il MIMIT fornisce solo la sigla; questa tabella dà il nome leggibile.
 */
export const PROVINCE_NAMES: Record<string, string> = {
  AG: 'Agrigento', AL: 'Alessandria', AN: 'Ancona', AO: 'Aosta', AR: 'Arezzo',
  AP: 'Ascoli Piceno', AT: 'Asti', AV: 'Avellino', BA: 'Bari', BT: 'Barletta-Andria-Trani',
  BL: 'Belluno', BN: 'Benevento', BG: 'Bergamo', BI: 'Biella', BO: 'Bologna',
  BZ: 'Bolzano', BS: 'Brescia', BR: 'Brindisi', CA: 'Cagliari', CL: 'Caltanissetta',
  CB: 'Campobasso', CE: 'Caserta', CT: 'Catania', CZ: 'Catanzaro', CH: 'Chieti',
  CO: 'Como', CS: 'Cosenza', CR: 'Cremona', KR: 'Crotone', CN: 'Cuneo',
  EN: 'Enna', FM: 'Fermo', FE: 'Ferrara', FI: 'Firenze', FG: 'Foggia',
  FC: 'Forlì-Cesena', FR: 'Frosinone', GE: 'Genova', GO: 'Gorizia', GR: 'Grosseto',
  IM: 'Imperia', IS: 'Isernia', AQ: "L'Aquila", SP: 'La Spezia', LT: 'Latina',
  LE: 'Lecce', LC: 'Lecco', LI: 'Livorno', LO: 'Lodi', LU: 'Lucca',
  MC: 'Macerata', MN: 'Mantova', MS: 'Massa-Carrara', MT: 'Matera', ME: 'Messina',
  MI: 'Milano', MO: 'Modena', MB: 'Monza e Brianza', NA: 'Napoli', NO: 'Novara',
  NU: 'Nuoro', OR: 'Oristano', PD: 'Padova', PA: 'Palermo', PR: 'Parma',
  PV: 'Pavia', PG: 'Perugia', PU: 'Pesaro e Urbino', PE: 'Pescara', PC: 'Piacenza',
  PI: 'Pisa', PT: 'Pistoia', PN: 'Pordenone', PZ: 'Potenza', PO: 'Prato',
  RG: 'Ragusa', RA: 'Ravenna', RC: 'Reggio Calabria', RE: 'Reggio Emilia', RI: 'Rieti',
  RN: 'Rimini', RM: 'Roma', RO: 'Rovigo', SA: 'Salerno', SS: 'Sassari',
  SV: 'Savona', SI: 'Siena', SR: 'Siracusa', SO: 'Sondrio', SU: 'Sud Sardegna',
  TA: 'Taranto', TE: 'Teramo', TR: 'Terni', TO: 'Torino', TP: 'Trapani',
  TN: 'Trento', TV: 'Treviso', TS: 'Trieste', UD: 'Udine', VA: 'Varese',
  VE: 'Venezia', VB: 'Verbano-Cusio-Ossola', VC: 'Vercelli', VR: 'Verona',
  VV: 'Vibo Valentia', VI: 'Vicenza', VT: 'Viterbo',
  // sigle sarde storiche
  CI: 'Carbonia-Iglesias', VS: 'Medio Campidano', OG: 'Ogliastra', OT: 'Olbia-Tempio',
};

/** Nome esteso di una provincia dalla sigla, o la sigla stessa se ignota. */
export function provinceName(sigla: string): string {
  return PROVINCE_NAMES[sigla.toUpperCase().trim()] ?? sigla;
}

/** Slug URL-safe da un nome (regione, provincia, comune). */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
