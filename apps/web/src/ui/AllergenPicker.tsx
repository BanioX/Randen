import {
  ALLERGENS,
  allergenLabel,
  allergenOfficial,
  sortAllergens,
  type AllergenId,
} from '@randen/core';
import { MultiChoiceChips } from './ChoiceChips';
import { formMessages } from './messages.forms';

export interface AllergenPickerProps {
  /** What the choice means: «Enthält», «Kann Spuren enthalten». Default «Allergene». */
  legend?: string | undefined;
  hideLegend?: boolean | undefined;
  value: readonly AllergenId[];
  /** Gets the chosen allergens in the order of the ordinance. */
  onChange: (value: AllergenId[]) => void;
  /**
   * Allergens that cannot be chosen here: for «Spuren» the ones the article already
   * contains.
   */
  unavailable?: readonly AllergenId[] | undefined;
  hint?: string | undefined;
  error?: string | null | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

/**
 * The fourteen allergens that have to be named in Switzerland, as chips in the order of the
 * ordinance. The chip carries the short word, the tooltip and the screen reader the official
 * wording. What a dish declares is computed from its articles (ADR-0008); this picker is for
 * the article itself and for extras of a recipe.
 */
export function AllergenPicker({
  legend = formMessages.allergens.legend,
  hideLegend,
  value,
  onChange,
  unavailable = [],
  hint,
  error,
  disabled,
  className,
}: AllergenPickerProps) {
  return (
    <MultiChoiceChips
      legend={legend}
      hideLegend={hideLegend}
      options={ALLERGENS.map(({ id }) => ({
        value: id,
        label: allergenLabel(id),
        description: allergenOfficial(id),
        disabled: unavailable.includes(id),
      }))}
      value={value}
      onChange={(next) => {
        onChange(sortAllergens(next));
      }}
      hint={hint}
      error={error}
      disabled={disabled}
      className={className}
    />
  );
}
