/**
 * Texts of printing, sharing and PDF files in the UI kit (ADR-0019), in German (Switzerland):
 * «ss» instead of «ß», one person addressed with «du», calm and exact. `app/messages.test.ts`
 * checks them like every other catalog.
 */
export const fileMessages = {
  print: {
    /** Read out while the PDF of the page is being prepared in the installed iOS app. */
    preparing: 'Das PDF wird vorbereitet …',
    /** The page was opened to print (`?drucken=1`) in the installed iOS app. */
    fromAddress:
      'Tippe auf «Drucken» und wähle im Teilen-Menü «Drucken» oder «In Dateien sichern».',
    sheetTitle: 'Drucken in der installierten App',
    pending:
      'Auf iPhone und iPad druckt die installierte App über ein PDF, das du im Teilen-Menü druckst oder in Dateien sicherst. Für diese Seite folgt das PDF noch.',
    pendingToday:
      'Bis dahin hilft ein Bildschirmfoto: Du druckst es aus der App Fotos. Die Speisekarte für Gäste gibt es schon als PDF.',
    /** The PDF could not be built from the page's data; «Noch einmal» builds it again. */
    buildFailed:
      'Das PDF liess sich nicht vorbereiten. Tippe auf «Noch einmal», dann erstellt Randen es neu. Geht es wieder nicht, schliesse Randen ganz und öffne es neu.',
    retry: 'Noch einmal',
    /** The finished PDF could be neither shared nor downloaded. */
    failed:
      'Das PDF liess sich weder weitergeben noch sichern. Schliesse Randen ganz, öffne es wieder und tippe noch einmal auf «Drucken».',
    close: 'Verstanden',
  },
  pdf: {
    printedOn: (date: string) => `Gedruckt am ${date}`,
    page: (page: number, pages: number) => `Seite ${String(page)} von ${String(pages)}`,
  },
} as const;
