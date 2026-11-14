import { DisplaySection } from './DisplaySection';
import { FormsSection } from './FormsSection';

/**
 * Every building block of the UI kit on one page: the reference for people who build screens,
 * the target of the accessibility check and of the preview pictures.
 */
export function StyleguidePage() {
  return (
    <div className="space-y-10">
      <h1 className="large-title">Styleguide</h1>
      <DisplaySection />
      <FormsSection />
    </div>
  );
}
