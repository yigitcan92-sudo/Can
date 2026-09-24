// Inhoud van de surveyor-gids. Zet isTemplate op false zodra de echte inhoud
// (BEON-symbolenlegende en quadrantentabel uit de bestaande gids) is overgenomen.
export const GUIDE = {
  isTemplate: true,
  title: 'Surveyor-gids — Fiberklaar Waasland',
  intro:
    'Praktische richtlijnen voor de site survey (SSV) en het tekenen van het plan. Houd deze gids bij de hand tijdens elk bezoek.',
  sections: [
    {
      title: 'Werkwijze per adres',
      steps: [
        'Open de app en filter op je eigen adressen, gesorteerd op route.',
        'Controleer bij aankomst adres en unitnummer.',
        'Voer de survey uit en maak de schets volgens de symbolenlegende hieronder.',
        'Zet de status meteen in de app (Done, No Access, Refused, …) en noteer bijzonderheden bij de opmerkingen.',
        'Niemand thuis? Status "No Access" en noteer tijdstip in de opmerkingen.',
      ],
    },
    {
      title: 'BEON-symbolenlegende',
      text: 'Sjabloon — vervang door de symbolen uit de bestaande gids.',
      table: {
        head: ['Symbool', 'Betekenis', 'Opmerking'],
        symbolCol: 0,
        rows: [
          ['□', '(symbool 1 — over te nemen)', ''],
          ['○', '(symbool 2 — over te nemen)', ''],
          ['△', '(symbool 3 — over te nemen)', ''],
        ],
      },
    },
    {
      title: 'Quadrantentabel',
      text: 'Sjabloon — vervang door de quadrantentabel uit de bestaande gids.',
      table: {
        head: ['Quadrant', 'Omschrijving'],
        rows: [
          ['Q1', '(over te nemen)'],
          ['Q2', '(over te nemen)'],
          ['Q3', '(over te nemen)'],
          ['Q4', '(over te nemen)'],
        ],
      },
    },
    {
      title: 'Statussen SSV',
      table: {
        head: ['Status', 'Wanneer gebruiken'],
        rows: [
          ['Ongoing', 'Adres is toegewezen maar nog niet afgewerkt'],
          ['Done', 'Survey volledig uitgevoerd'],
          ['Pending Validation', 'Survey uitgevoerd, wacht op validatie'],
          ['Pre-existing Fiber', 'Er is al glasvezel aanwezig'],
          ['SDU', 'Eengezinswoning — valt buiten deze scope'],
          ['No Access', 'Geen toegang tot het gebouw'],
          ['Refused', 'Eigenaar/syndicus weigert'],
          ['Issue', 'Technisch probleem — beschrijf in opmerkingen'],
          ['Nac', '(omschrijving aanvullen)'],
        ],
      },
    },
  ],
};
