import type { AreaKind } from '../../domain/categories';
import type { TaskFrequency } from '../../model/haccp';
import type { Weekday } from '../../model/primitives';

/**
 * The starter cleaning plan of a business without tasks (`hygiene.standardPlan`). Typical tasks
 * by frequency, as the guideline for the catering trade names them (GVG, docs/fakten.md 4.2:
 * Reinigungsplan, Schädlinge, «first in, first out» in the storage). Every instruction says it is
 * a proposal to adapt; the business keeps its own concept.
 */
export interface StandardTask {
  name: string;
  frequency: TaskFrequency;
  weekday?: Weekday;
  /** The first live area of this kind gets the task, if the business has one. */
  areaKind?: AreaKind;
  instructions: string;
}

const PROPOSAL = 'Vorschlag, im eigenen Selbstkontrollkonzept anpassen.';

export const STANDARD_TASKS: readonly StandardTask[] = [
  {
    name: 'Arbeitsflächen und Schneidbretter reinigen',
    frequency: 'daily',
    instructions: `Nach jedem Gebrauch mit Reinigungsmittel abwaschen, danach desinfizieren. ${PROPOSAL}`,
  },
  {
    name: 'Böden nass reinigen',
    frequency: 'daily',
    instructions: `Am Ende des Dienstes, Reinigungsmittel nach Dosierung. ${PROPOSAL}`,
  },
  {
    name: 'Abfall leeren',
    frequency: 'daily',
    instructions: `Behälter in der Küche leeren und ausspülen. ${PROPOSAL}`,
  },
  {
    name: 'Handwaschbecken auffüllen',
    frequency: 'daily',
    instructions: `Seife, Papiertücher und Desinfektionsmittel prüfen und nachfüllen. ${PROPOSAL}`,
  },
  {
    name: 'Kühlzelle auswischen',
    frequency: 'weekly',
    weekday: 'mon',
    areaKind: 'cold',
    instructions: `Böden und Ablagen auswischen, Dichtungen abwischen. ${PROPOSAL}`,
  },
  {
    name: 'Dampfabzugfilter reinigen',
    frequency: 'weekly',
    weekday: 'wed',
    instructions: `Filter herausnehmen und entfetten. ${PROPOSAL}`,
  },
  {
    name: 'Trockenlager kontrollieren',
    frequency: 'weekly',
    weekday: 'fri',
    areaKind: 'dry',
    instructions: `Schädlinge, Feuchtigkeit und Ablaufdaten prüfen. ${PROPOSAL}`,
  },
  {
    name: 'Lager nach FEFO einräumen',
    frequency: 'weekly',
    weekday: 'mon',
    instructions: `Ware mit dem frühesten Datum nach vorn, alles datiert und beschriftet («first in, first out», Leitlinie). ${PROPOSAL}`,
  },
  {
    name: 'Tiefkühlzelle abtauen und reinigen',
    frequency: 'monthly',
    areaKind: 'frozen',
    instructions: `Abtauen, Eis entfernen, Innenraum reinigen; Ware kühl zwischenlagern und die Temperatur danach messen. ${PROPOSAL}`,
  },
  {
    name: 'Schädlingskontrolle',
    frequency: 'monthly',
    instructions: `Sichtkontrolle in Lager und Küche; bei Befall den Schädlingsbekämpfer rufen. ${PROPOSAL}`,
  },
];
